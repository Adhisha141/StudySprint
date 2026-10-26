
from datetime import date, datetime
from typing import Optional

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import (
    create_engine, String, Integer, Boolean, Date,
    DateTime, ForeignKey
)
from sqlalchemy.orm import (
    DeclarativeBase, Mapped, mapped_column,
    relationship, sessionmaker, Session
)

# Database: persistent local SQLite file
engine = create_engine(
    "sqlite:///./studysprint.db",
    connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(bind=engine)


class Base(DeclarativeBase):
    pass


class Subject(Base):
    __tablename__ = "subjects"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    exam_date: Mapped[Optional[date]] = mapped_column(
        Date, nullable=True
    )
    daily_hours: Mapped[int] = mapped_column(Integer, default=1)

    tasks: Mapped[list["Task"]] = relationship(
        back_populates="subject",
        cascade="all, delete-orphan"
    )


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    subject_id: Mapped[int] = mapped_column(
        ForeignKey("subjects.id")
    )
    due_date: Mapped[Optional[date]] = mapped_column(
        Date, nullable=True
    )
    completed: Mapped[bool] = mapped_column(
        Boolean, default=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )

    subject: Mapped["Subject"] = relationship(
        back_populates="tasks"
    )


Base.metadata.create_all(bind=engine)

app = FastAPI(title="StudySprint API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
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


@app.get("/")
def home():
    return {"message": "Welcome to StudySprint API"}


@app.get("/api/health")
def health():
    return {"status": "healthy"}


@app.get("/api/subjects")
def list_subjects(db: Session = Depends(get_db)):
    subjects = db.query(Subject).order_by(Subject.id.desc()).all()
    return [
        {
            "id": s.id,
            "name": s.name,
            "exam_date": s.exam_date,
            "daily_hours": s.daily_hours,
        }
        for s in subjects
    ]


@app.post("/api/subjects", status_code=201)
def create_subject(
    data: SubjectCreate,
    db: Session = Depends(get_db)
):
    subject = Subject(**data.model_dump())
    db.add(subject)
    db.commit()
    db.refresh(subject)
    return {
        "id": subject.id,
        "name": subject.name,
        "exam_date": subject.exam_date,
        "daily_hours": subject.daily_hours,
    }


@app.delete("/api/subjects/{subject_id}")
def delete_subject(
    subject_id: int,
    db: Session = Depends(get_db)
):
    subject = db.get(Subject, subject_id)
    if not subject:
        raise HTTPException(404, "Subject not found")
    db.delete(subject)
    db.commit()
    return {"message": "Subject deleted"}


@app.get("/api/tasks")
def list_tasks(db: Session = Depends(get_db)):
    tasks = db.query(Task).order_by(Task.id.desc()).all()
    return [
        {
            "id": t.id,
            "title": t.title,
            "subject_id": t.subject_id,
            "subject_name": t.subject.name,
            "due_date": t.due_date,
            "completed": t.completed,
        }
        for t in tasks
    ]


@app.post("/api/tasks", status_code=201)
def create_task(
    data: TaskCreate,
    db: Session = Depends(get_db)
):
    if not db.get(Subject, data.subject_id):
        raise HTTPException(404, "Subject not found")

    task = Task(**data.model_dump())
    db.add(task)
    db.commit()
    db.refresh(task)

    return {
        "id": task.id,
        "title": task.title,
        "subject_id": task.subject_id,
        "subject_name": task.subject.name,
        "due_date": task.due_date,
        "completed": task.completed,
    }


@app.patch("/api/tasks/{task_id}")
def update_task(
    task_id: int,
    data: TaskUpdate,
    db: Session = Depends(get_db)
):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(404, "Task not found")

    task.completed = data.completed
    db.commit()
    db.refresh(task)

    return {"id": task.id, "completed": task.completed}


@app.delete("/api/tasks/{task_id}")
def delete_task(
    task_id: int,
    db: Session = Depends(get_db)
):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    db.delete(task)
    db.commit()
    return {"message": "Task deleted"}


@app.get("/api/stats")
def get_stats(db: Session = Depends(get_db)):
    subjects = db.query(Subject).count()
    total = db.query(Task).count()
    completed = db.query(Task).filter(
        Task.completed.is_(True)
    ).count()

    return {
        "subjects": subjects,
        "total_tasks": total,
        "completed_tasks": completed,
        "completion_percent": round(
            completed / total * 100 if total else 0
        ),
    }
