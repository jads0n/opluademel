import os
import random
import string
import json
from datetime import datetime
from typing import List, Optional

from fastapi import FastAPI, HTTPException, Header, Body, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

app = FastAPI(title="Lua de Mel Mines - Backend")


# CORS middleware to allow requests from the frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost",
        "http://127.0.0.1",
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "*"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"]
)

# Supabase Client Setup — singleton per process for performance
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Warning: SUPABASE_URL and SUPABASE_KEY must be set in the .env file.")

# Create once at module level — reused across all requests in this worker
_supabase_client: Optional[Client] = None

def get_supabase() -> Client:
    global _supabase_client
    if _supabase_client is None:
        if not SUPABASE_URL or not SUPABASE_KEY:
            raise HTTPException(status_code=500, detail="Database configuration missing.")
        _supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
    return _supabase_client

# Global exception handler so unhandled errors return JSON with CORS headers
from fastapi.responses import JSONResponse

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    import traceback
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error. Please try again."},
        headers={"Access-Control-Allow-Origin": "*"}
    )

# Constants (tabuleiro)
# Atualizado para 5x5 (25 casas) com 5 bombas, para bater com o novo frontend.
GRID_SIZE = 5
TOTAL_CELLS = GRID_SIZE * GRID_SIZE
TOTAL_BOMBS = 5
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "podelimparmesmo")
if ADMIN_PASSWORD == "podelimparmesmo":
    print("Warning: ADMIN_PASSWORD not set; using insecure default.")

# Pydantic Models
class GenerateTicketRequest(BaseModel):
    amount_paid: float
    donor_name: Optional[str] = None
    donor_gender: Optional[str] = None

class GenerateTicketResponse(BaseModel):
    code: str
    multiplier: float

class StartGameRequest(BaseModel):
    code: str
    player_name: str
    player_gender: Optional[str] = ''

class StartGameResponse(BaseModel):
    game_id: str
    multiplier: float

class ClickRequest(BaseModel):
    game_id: str
    row: int
    col: int

class ClickResponse(BaseModel):
    result: str # "safe" or "bomb"
    current_score: int
    grid: Optional[List[List[str]]] = None # Only returned when a bomb is hit

class CashoutRequest(BaseModel):
    game_id: str

class CashoutResponse(BaseModel):
    final_score: int

# Helper functions
def generate_random_code(length=6) -> str:
    """Generate a random alphanumeric uppercase code."""
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=length))

def generate_grid() -> List[List[str]]:
    """Generates a 9x9 grid with 10 bombs."""
    grid = [['safe' for _ in range(GRID_SIZE)] for _ in range(GRID_SIZE)]
    
    bombs_placed = 0
    while bombs_placed < TOTAL_BOMBS:
        row = random.randint(0, GRID_SIZE - 1)
        col = random.randint(0, GRID_SIZE - 1)
        if grid[row][col] != 'bomb':
            grid[row][col] = 'bomb'
            bombs_placed += 1
            
    return grid

# --- Admin Routes ---

@app.post("/admin/generate-ticket", response_model=GenerateTicketResponse)
async def generate_ticket(request: GenerateTicketRequest, password: str = Header(None)):
    if password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    supabase = get_supabase()
    
    # Generate unique code
    code = generate_random_code()
    # Ensure it's unique (simplified logic, ideally handle constraint violation)
    existing = supabase.table("tickets").select("id").eq("code", code).execute()
    while existing.data:
        code = generate_random_code()
        existing = supabase.table("tickets").select("id").eq("code", code).execute()
    
    multiplier = request.amount_paid / 10.0
    
    data = {"code": code, "amount_paid": request.amount_paid, "multiplier": multiplier, "donor_name": request.donor_name, "donor_gender": request.donor_gender}
    response = supabase.table("tickets").insert(data).execute()
    
    return GenerateTicketResponse(code=code, multiplier=multiplier)

@app.get("/admin/donations")
async def get_donations(password: str = Header(None)):
    if password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    supabase = get_supabase()
    # Get all tickets to calculate total raised and list donors
    response = supabase.table("tickets").select("*").order("created_at", desc=True).execute()
    
    total_raised = sum(ticket.get("amount_paid", 0) for ticket in response.data)
    
    # We might also want to join with games to show their score if they played
    games_response = supabase.table("games").select("ticket_id, current_score, status").execute()
    games_map = {g["ticket_id"]: g for g in games_response.data}
    
    donations = []
    for ticket in response.data:
        game_info = games_map.get(ticket["id"], {})
        donations.append({
            "donor_name": ticket.get("donor_name", "Anônimo"),
            "donor_gender": ticket.get("donor_gender", "N/A"),
            "amount_paid": ticket.get("amount_paid"),
            "code": ticket.get("code"),
            "is_used": ticket.get("is_used"),
            "score": game_info.get("current_score", 0) if game_info.get("status") == "cashed_out" else 0
        })
        
    return {"total_raised": total_raised, "donations": donations}


@app.post("/admin/clear")
async def clear_database(password: str = Header(None)):
    if password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    supabase = get_supabase()
    # Supabase REST API doesn't easily support truncating via standard client endpoints without
    # deleting by ID, so we delete all where ID is not null
    try:
        # Note: Deleting tickets will cascade delete games if FK ON DELETE CASCADE is set
         supabase.table("tickets").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
         return {"message": "Database cleared successfully."}
    except Exception as e:
         raise HTTPException(status_code=500, detail=str(e))

# --- Game Routes ---

@app.post("/game/start", response_model=StartGameResponse)
async def start_game(request: StartGameRequest):
    supabase = get_supabase()
    
    # Verify ticket
    ticket_res = supabase.table("tickets").select("*").eq("code", request.code).execute()
    if not ticket_res.data:
        raise HTTPException(status_code=404, detail="Invalid code.")
        
    ticket = ticket_res.data[0]
    if ticket.get("is_used"):
        raise HTTPException(status_code=400, detail="Code already used.")
        
    # Generate grid
    grid = generate_grid()
    
    # Create game
    game_data = {
        "ticket_id": ticket["id"],
        "player_name": request.player_name,
        "grid_state": grid,
        "current_score": 0,
        "status": "active"
    }
    
    game_res = supabase.table("games").insert(game_data).execute()
    if not game_res.data:
         raise HTTPException(status_code=500, detail="Failed to create game.")
         
    game_id = game_res.data[0]["id"]
    
    # Save player name and gender back to the ticket so it appears in the Donations/Leaderboard panels
    supabase.table("tickets").update({
        "donor_name": request.player_name,
        "donor_gender": request.player_gender
    }).eq("id", ticket["id"]).execute()
    
    return StartGameResponse(game_id=game_id, multiplier=ticket["multiplier"])


@app.post("/game/click", response_model=ClickResponse)
async def click_cell(request: ClickRequest):
    supabase = get_supabase()
    
    # 1. Fetch game and ticket
    game_res = supabase.table("games").select("*").eq("id", request.game_id).execute()
    if not game_res.data:
        raise HTTPException(status_code=404, detail="Game not found.")
        
    game = game_res.data[0]
    
    if game["status"] != "active":
         raise HTTPException(status_code=400, detail="Game is no longer active.")
         
    ticket_res = supabase.table("tickets").select("*").eq("id", game["ticket_id"]).execute()
    ticket = ticket_res.data[0]
    multiplier = ticket["multiplier"]
    
    grid = game["grid_state"]
    row, col = request.row, request.col
    
    if row < 0 or row >= GRID_SIZE or col < 0 or col >= GRID_SIZE:
         raise HTTPException(status_code=400, detail="Invalid coordinates.")
         
    cell_value = grid[row][col]
    
    if cell_value == "bomb":
        # BUSTED
        supabase.table("games").update({"status": "busted", "current_score": 0}).eq("id", request.game_id).execute()
        supabase.table("tickets").update({"is_used": True}).eq("id", game["ticket_id"]).execute()
        return ClickResponse(result="bomb", current_score=0, grid=grid)
    else:
        # SAFE
        new_score = game["current_score"] + int(100 * multiplier)
        supabase.table("games").update({"current_score": new_score}).eq("id", request.game_id).execute()
        return ClickResponse(result="safe", current_score=new_score)


@app.post("/game/cashout", response_model=CashoutResponse)
async def cashout(request: CashoutRequest):
    supabase = get_supabase()
    
    game_res = supabase.table("games").select("*").eq("id", request.game_id).execute()
    if not game_res.data:
        raise HTTPException(status_code=404, detail="Game not found.")
        
    game = game_res.data[0]
    
    if game["status"] != "active":
         raise HTTPException(status_code=400, detail="Game cannot be cashed out.")
         
    # Update game and ticket status
    supabase.table("games").update({"status": "cashed_out"}).eq("id", request.game_id).execute()
    supabase.table("tickets").update({"is_used": True}).eq("id", game["ticket_id"]).execute()
    
    return CashoutResponse(final_score=game["current_score"])


@app.get("/leaderboard")
async def get_leaderboard():
    supabase = get_supabase()

    # Get top 50 cashed-out games
    games_res = supabase.table("games") \
        .select("player_name, current_score, ticket_id") \
        .eq("status", "cashed_out") \
        .order("current_score", desc=True) \
        .limit(50) \
        .execute()

    if not games_res.data:
        return {"leaderboard_men": [], "leaderboard_women": [], "leaderboard": []}

    # Fetch all ticket genders for these games
    ticket_ids = list({g["ticket_id"] for g in games_res.data})
    tickets_res = supabase.table("tickets").select("id, donor_gender").in_("id", ticket_ids).execute()
    gender_map = {t["id"]: t.get("donor_gender", "") for t in tickets_res.data}

    men = []
    women = []
    all_players = []

    for g in games_res.data:
        gender = gender_map.get(g["ticket_id"], "")
        entry = {"player_name": g["player_name"], "current_score": g["current_score"], "gender": gender}
        all_players.append(entry)
        if gender == "Homem":
            men.append(entry)
        elif gender == "Mulher":
            women.append(entry)

    # Sort each by score descending, top 10
    men = sorted(men, key=lambda x: x["current_score"], reverse=True)[:10]
    women = sorted(women, key=lambda x: x["current_score"], reverse=True)[:10]
    all_players = sorted(all_players, key=lambda x: x["current_score"], reverse=True)[:20]

    return {"leaderboard_men": men, "leaderboard_women": women, "leaderboard": all_players}


# Serve frontend static files — must be AFTER all API routes
import os as _os
_frontend_dir = _os.path.join(_os.path.dirname(__file__), "..", "frontend")
app.mount("/", StaticFiles(directory=_frontend_dir, html=True), name="frontend")
