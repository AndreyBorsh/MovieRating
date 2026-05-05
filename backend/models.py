from sqlalchemy import Column, Integer, String, Float, ForeignKey, Text, UniqueConstraint
from database import Base

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    email = Column(String, unique=True)
    password = Column(String)

class Movie(Base):
    __tablename__ = "movies"
    id = Column(Integer, primary_key=True)
    title = Column(String)

class Rating(Base):
    __tablename__ = "ratings"
    id = Column(Integer, primary_key=True)

    user_id = Column(Integer, ForeignKey("users.id"))
    movie_id = Column(Integer, ForeignKey("movies.id"))

    p = Column(Float)
    s = Column(Float)
    d = Column(Float)
    a = Column(Float)
    v = Column(Float)
    g = Column(Float)

    score = Column(Float)

    review = Column(Text)  # ⭐ рецензия

    __table_args__ = (UniqueConstraint('user_id', 'movie_id'),)