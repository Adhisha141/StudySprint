from dotenv import load_dotenv
load_dotenv()

import os
import secrets
import hashlib
from datetime import date, datetime, timedelta, timezone
from typing import Optional

import jwt
from pwdlib import PasswordHash
from fastapi import FastAPI, Depends, HTTPException, Response, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, EmailStr
from sqlalchemy import (
    create_engine, String, Integer, Boolean, Date, DateTime,
    ForeignKey, select, func
)
from sqlalchemy.orm import (
    DeclarativeBase, Mapped, mapped_column, relationship,
    sessionmaker, Session
)

# Configuration
SECRET_KEY = os.getenv("JWT_SECRET")
if not SECRET_KEY or SECRET_KEY == "replace_this_with_a_long_random_secret":
    raise RuntimeError("Set a strong JWT_SECRET in backend/.env before starting.")

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5174")
COOKIE_NAME = "studysprint_session"
password_hash = PasswordHash.recommended()

engine = create_engine(
    "sqlite:///./studysprint.db",
    connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )


class Subject(Base):
    __tablename__ = "subjects"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    exam_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    daily_hours: Mapped[int] = mapped_column(Integer, default=1)
    owner_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id"), nullable=True, index=True
    )

    tasks: Mapped[list["Task"]] = relationship(
        back_populates="subject", cascade="all, delete-orphan"
    )


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    subject_id: Mapped[int] = mapped_column(ForeignKey("subjects.id"))
    due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    completed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )

    subject: Mapped["Subject"] = relationship(back_populates="tasks")


# Create new tables and safely add the ownership column to an old SQLite DB.
Base.metadata.create_all(bind=engine)

from sqlalchemy import inspect, text

with engine.begin() as conn:
    columns = {c["name"] for c in inspect(engine).get_columns("subjects")}
    if "owner_id" not in columns:
        conn.execute(text(
            "ALTER TABLE subjects ADD COLUMN owner_id INTEGER REFERENCES users(id)"
        ))


app = FastAPI(title="StudySprint API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def current_user(
    request: Request,
    db: Session = Depends(get_db)
) -> User:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(401, "Please log in.")

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        user_id = int(payload["sub"])
    except (jwt.InvalidTokenError, KeyError, TypeError, ValueError):
        raise HTTPException(401, "Session expired. Please log in.")

    user = db.get(User, user_id)
    if not user:
        raise HTTPException(401, "Account not found.")
    return user


def make_session(user: User, response: Response):
    token = jwt.encode(
        {
            "sub": str(user.id),
            "exp": datetime.now(timezone.utc) + timedelta(hours=12),
        },
        SECRET_KEY,
        algorithm="HS256",
    )
    response.set_cookie(
        COOKIE_NAME,
        token,
        httponly=True,
        secure=os.getenv("COOKIE_SECURE", "false").lower() == "true",
        samesite="lax",
        max_age=12 * 60 * 60,
        path="/",
    )


def owned_subject(db: Session, subject_id: int, user_id: int) -> Subject:
    subject = db.scalar(
        select(Subject).where(
            Subject.id == subject_id, Subject.owner_id == user_id
        )
    )
    if not subject:
        raise HTTPException(404, "Subject not found.")
    return subject


def owned_task(db: Session, task_id: int, user_id: int) -> Task:
    task = db.scalar(
        select(Task).join(Subject).where(
            Task.id == task_id, Subject.owner_id == user_id
        )
    )
    if not task:
        raise HTTPException(404, "Task not found.")
    return task


class RegisterData(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginData(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class SubjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    exam_date: Optional[date] = None
    daily_hours: int = Field(default=1, ge=1, le=16)


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    subject_id: int
    due_date: Optional[date] = None


class TaskUpdate(BaseModel):
    completed: bool


class ResetRequest(BaseModel):
    email: EmailStr


class ResetConfirm(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)


# Development-only reset tokens. Replace with persistent storage and email
# delivery before deployment.
reset_tokens = {}


@app.get("/")
def home():
    return {"message": "Welcome to StudySprint API"}


@app.get("/api/health")
def health():
    return {"status": "healthy"}


@app.post("/api/auth/register", status_code=201)
def register(data: RegisterData, response: Response,
             db: Session = Depends(get_db)):
    email = str(data.email).lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(409, "An account with this email already exists.")

    user = User(email=email, password_hash=password_hash.hash(data.password))
    db.add(user)
    db.flush()

    # Claim old unowned subjects for the first registered account only.
    if db.scalar(select(func.count()).select_from(User)) == 1:
        db.query(Subject).filter(Subject.owner_id.is_(None)).update(
            {"owner_id": user.id}, synchronize_session=False
        )

    db.commit()
    db.refresh(user)
    make_session(user, response)
    return {"id": user.id, "email": user.email}


@app.post("/api/auth/login")
def login(data: LoginData, response: Response,
          db: Session = Depends(get_db)):
    email = str(data.email).lower()
    user = db.scalar(select(User).where(User.email == email))

    if not user or not password_hash.verify(data.password, user.password_hash):
        raise HTTPException(401, "Incorrect email or password.")

    make_session(user, response)
    return {"id": user.id, "email": user.email}


@app.get("/api/auth/me")
def me(user: User = Depends(current_user)):
    return {"id": user.id, "email": user.email}


@app.post("/api/auth/logout")
def logout(response: Response):
    response.delete_cookie(COOKIE_NAME, path="/", httponly=True, samesite="lax")
    return {"message": "Logged out."}


@app.post("/api/auth/forgot-password")
def forgot_password(data: ResetRequest, db: Session = Depends(get_db)):
    # Same response whether the email exists or not.
    user = db.scalar(select(User).where(User.email == str(data.email).lower()))
    if user:
        raw_token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        reset_tokens[token_hash] = (
            user.id, datetime.now(timezone.utc) + timedelta(minutes=15)
        )
        # Development only: token appears in the backend terminal.
        print(f"PASSWORD RESET TOKEN (development only): {raw_token}")

    return {"message": "If the account exists, reset instructions will be sent."}


@app.post("/api/auth/reset-password")
def reset_password(data: ResetConfirm, db: Session = Depends(get_db)):
    token_hash = hashlib.sha256(data.token.encode()).hexdigest()
    entry = reset_tokens.pop(token_hash, None)

    if not entry or entry[1] < datetime.now(timezone.utc):
        raise HTTPException(400, "Reset token is invalid or expired.")

    user = db.get(User, entry[0])
    if not user:
        raise HTTPException(400, "Reset token is invalid or expired.")

    user.password_hash = password_hash.hash(data.new_password)
    db.commit()
    return {"message": "Password changed. Please log in again."}


@app.get("/api/subjects")
def list_subjects(db: Session = Depends(get_db),
                  user: User = Depends(current_user)):
    subjects = db.scalars(
        select(Subject).where(Subject.owner_id == user.id)
        .order_by(Subject.id.desc())
    ).all()
    return [
        {"id": s.id, "name": s.name, "exam_date": s.exam_date,
         "daily_hours": s.daily_hours}
        for s in subjects
    ]


@app.post("/api/subjects", status_code=201)
def create_subject(data: SubjectCreate, db: Session = Depends(get_db),
                   user: User = Depends(current_user)):
    subject = Subject(**data.model_dump(), owner_id=user.id)
    db.add(subject)
    db.commit()
    db.refresh(subject)
    return {"id": subject.id, "name": subject.name,
            "exam_date": subject.exam_date, "daily_hours": subject.daily_hours}


@app.delete("/api/subjects/{subject_id}")
def delete_subject(subject_id: int, db: Session = Depends(get_db),
                   user: User = Depends(current_user)):
    subject = owned_subject(db, subject_id, user.id)
    db.delete(subject)
    db.commit()
    return {"message": "Subject deleted"}


@app.get("/api/tasks")
def list_tasks(db: Session = Depends(get_db),
               user: User = Depends(current_user)):
    tasks = db.scalars(
        select(Task).join(Subject).where(Subject.owner_id == user.id)
        .order_by(Task.id.desc())
    ).all()
    return [
        {"id": t.id, "title": t.title, "subject_id": t.subject_id,
         "subject_name": t.subject.name, "due_date": t.due_date,
         "completed": t.completed}
        for t in tasks
    ]


@app.post("/api/tasks", status_code=201)
def create_task(data: TaskCreate, db: Session = Depends(get_db),
                user: User = Depends(current_user)):
    owned_subject(db, data.subject_id, user.id)
    task = Task(**data.model_dump())
    db.add(task)
    db.commit()
    db.refresh(task)
    return {"id": task.id, "title": task.title, "subject_id": task.subject_id,
            "subject_name": task.subject.name, "due_date": task.due_date,
            "completed": task.completed}


@app.patch("/api/tasks/{task_id}")
def update_task(task_id: int, data: TaskUpdate, db: Session = Depends(get_db),
                user: User = Depends(current_user)):
    task = owned_task(db, task_id, user.id)
    task.completed = data.completed
    db.commit()
    return {"id": task.id, "completed": task.completed}


@app.delete("/api/tasks/{task_id}")
def delete_task(task_id: int, db: Session = Depends(get_db),
                user: User = Depends(current_user)):
    task = owned_task(db, task_id, user.id)
    db.delete(task)
    db.commit()
    return {"message": "Task deleted"}


@app.get("/api/stats")
def get_stats(db: Session = Depends(get_db),
              user: User = Depends(current_user)):
    subjects = db.scalar(
        select(func.count()).select_from(Subject)
        .where(Subject.owner_id == user.id)
    ) or 0
    total = db.scalar(
        select(func.count()).select_from(Task).join(Subject)
        .where(Subject.owner_id == user.id)
    ) or 0
    completed = db.scalar(
        select(func.count()).select_from(Task).join(Subject)
        .where(Subject.owner_id == user.id, Task.completed.is_(True))
    ) or 0

    return {
        "subjects": subjects,
        "total_tasks": total,
        "completed_tasks": completed,
        "completion_percent": round(completed / total * 100 if total else 0),
    }
