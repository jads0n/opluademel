-- Tabela de Tickets
CREATE TABLE tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(6) UNIQUE NOT NULL,
    amount_paid FLOAT NOT NULL,
    multiplier FLOAT NOT NULL,
    donor_name VARCHAR(255),
    donor_gender VARCHAR(10),
    is_used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Tabela de Jogos
CREATE TABLE games (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID REFERENCES tickets(id) ON DELETE CASCADE,
    player_name VARCHAR(255) NOT NULL,
    grid_state JSONB NOT NULL,
    current_score INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'cashed_out', 'busted')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Índices para otimização
CREATE INDEX idx_tickets_code ON tickets(code);
CREATE INDEX idx_games_ticket_id ON games(ticket_id);
CREATE INDEX idx_games_status_score ON games(status, current_score DESC);
