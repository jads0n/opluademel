import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# Fetch all tickets
tickets = supabase.table("tickets").select("id, donor_name, donor_gender").execute().data

for t in tickets:
    name = t.get("donor_name")
    gender = t.get("donor_gender")
    if name and not gender:
        # Infer gender roughly
        name_lower = name.lower()
        new_gender = "Mulher" if name_lower in ["ana", "li"] else "Homem"
        supabase.table("tickets").update({"donor_gender": new_gender}).eq("id", t["id"]).execute()
        print(f"Updated {name} to {new_gender}")
print("Database fix completed.")
