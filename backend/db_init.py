import psycopg2

conn = psycopg2.connect(
    host="localhost",
    port=5432,
    database="movies_db",
    user="admin",
    password="admin123"
)
conn.autocommit = True
cur = conn.cursor()

# Drop in reverse dependency order
cur.execute("DROP TABLE IF EXISTS ratings;")
cur.execute("DROP TABLE IF EXISTS movies;")
cur.execute("DROP TABLE IF EXISTS users;")

cur.execute("""
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);
""")

# Movies cache from TMDB
cur.execute("""
CREATE TABLE movies (
    tmdb_id INT PRIMARY KEY,
    title TEXT NOT NULL,
    overview TEXT,
    poster_path TEXT,
    release_year INT,
    cached_at TIMESTAMP DEFAULT NOW()
);
""")

# Ratings with 6 criteria
cur.execute("""
CREATE TABLE ratings (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    tmdb_id INT REFERENCES movies(tmdb_id) ON DELETE CASCADE,
    overall INT NOT NULL CHECK (overall BETWEEN 1 AND 10),
    story INT NOT NULL CHECK (story BETWEEN 1 AND 10),
    direction INT NOT NULL CHECK (direction BETWEEN 1 AND 10),
    acting INT NOT NULL CHECK (acting BETWEEN 1 AND 10),
    visuals INT NOT NULL CHECK (visuals BETWEEN 1 AND 10),
    music INT NOT NULL CHECK (music BETWEEN 1 AND 10),
    score FLOAT NOT NULL,
    review TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, tmdb_id)
);
""")

cur.close()
conn.close()
print("DB initialized successfully — new schema with 6 criteria")
