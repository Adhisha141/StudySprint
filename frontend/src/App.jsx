
import { useEffect, useState } from "react";
import {
  BookOpen, LayoutDashboard, CalendarDays, CheckCircle2,
  Clock3, Target, Plus, Trash2, Zap, RefreshCw, LogOut,
  CalendarClock
} from "lucide-react";
import "./App.css";
const API = import.meta.env.VITE_API_URL || "http://localhost:8001";

function App() {
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState("login");
  const [resetToken, setResetToken] = useState("");
  const [resetNewPassword, setResetNewPassword] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  const [subjects, setSubjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [stats, setStats] = useState({
    subjects: 0,
    total_tasks: 0,
    completed_tasks: 0,
    completion_percent: 0
  });

  const [subjectName, setSubjectName] = useState("");
  const [examDate, setExamDate] = useState("");
  const [dailyHours, setDailyHours] = useState(2);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskSubject, setTaskSubject] = useState("");
  const [taskDate, setTaskDate] = useState("");
  const [activeTab, setActiveTab] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function request(path, options = {}) {
    const response = await fetch(`${API}${path}`, {
      ...options,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });

    if (!response.ok) {
      const detail = await response.text();
      let message = detail || `Request failed (${response.status})`;

      try {
        const parsed = JSON.parse(detail);
        message = parsed.detail || message;
      } catch {
        // Keep the original response text.
      }

      throw new Error(message);
    }

    if (response.status === 204) return null;
    return response.json();
  }

  async function refreshData() {
    setError("");

    try {
      const [s, t, st] = await Promise.all([
        request("/api/subjects"),
        request("/api/tasks"),
        request("/api/stats")
      ]);

      setSubjects(s);
      setTasks(t);
      setStats(st);
    } catch (err) {
      console.error("StudySprint API error:", err);
      setError(err.message || "Could not load your study data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;

    async function initializeApp() {
      try {
        const currentUser = await request("/api/auth/me");

        if (!active) return;
        setUser(currentUser);

        const [s, t, st] = await Promise.all([
          request("/api/subjects"),
          request("/api/tasks"),
          request("/api/stats")
        ]);

        if (!active) return;
        setSubjects(s);
        setTasks(t);
        setStats(st);
      } catch {
        if (active) setUser(null);
      } finally {
        if (active) {
          setLoading(false);
          setAuthChecked(true);
        }
      }
    }

    initializeApp();

    return () => {
      active = false;
    };
  }, []);

  async function handleForgotPassword(e) {
    e.preventDefault();
    setAuthBusy(true);
    setResetMessage("");
    setError("");

    try {
      const result = await request("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: authEmail.trim() }),
      });

      setResetMessage(result.message);
    } catch (err) {
      setError(err.message || "Could not request password reset.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleResetPassword(e) {
    e.preventDefault();
    setAuthBusy(true);
    setResetMessage("");
    setError("");

    try {
      const result = await request("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({
          token: resetToken.trim(),
          new_password: resetNewPassword,
        }),
      });

      setResetMessage(result.message);
      setResetToken("");
      setResetNewPassword("");
      setAuthMode("login");
    } catch (err) {
      setError(err.message || "Could not reset password.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleAuth(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    setAuthBusy(true);

    try {
      const endpoint =
        authMode === "login"
          ? "/api/auth/login"
          : "/api/auth/register";

      const loggedInUser = await request(endpoint, {
        method: "POST",
        body: JSON.stringify({
          email: authEmail.trim(),
          password: authPassword
        })
      });

      setUser(loggedInUser);
      setAuthPassword("");
      setLoading(true);
      setError("");
      setNotice("");

      await refreshData();
    } catch (err) {
      setError(err.message || "Authentication failed.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleLogout() {
    try {
      await request("/api/auth/logout", { method: "POST" });
    } catch (err) {
      console.error("Logout error:", err);
    }

    setUser(null);
    setSubjects([]);
    setTasks([]);
    setStats({
      subjects: 0,
      total_tasks: 0,
      completed_tasks: 0,
      completion_percent: 0
    });
    setActiveTab("dashboard");
    setLoading(false);
    setError("");
    setNotice("");
    setAuthPassword("");
  }

  async function addSubject(e) {
    e.preventDefault();
    if (!subjectName.trim()) return;

    setBusy(true);
    setError("");
    setNotice("");

    try {
      await request("/api/subjects", {
        method: "POST",
        body: JSON.stringify({
          name: subjectName.trim(),
          exam_date: examDate || null,
          daily_hours: Number(dailyHours)
        })
      });

      setSubjectName("");
      setExamDate("");
      setDailyHours(2);
      setNotice("Subject added successfully!");
      setActiveTab("subjects");
      await refreshData();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function addTask(e) {
    e.preventDefault();

    if (!taskTitle.trim() || !taskSubject) {
      setError("Enter a task title and select a subject.");
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");

    try {
      await request("/api/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: taskTitle.trim(),
          subject_id: Number(taskSubject),
          due_date: taskDate || null
        })
      });

      setTaskTitle("");
      setTaskDate("");
      setNotice("Study task added!");
      await refreshData();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleTask(task) {
    setError("");

    try {
      await request(`/api/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ completed: !task.completed })
      });
      await refreshData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteTask(id) {
    if (!window.confirm("Delete this study task?")) return;

    try {
      await request(`/api/tasks/${id}`, { method: "DELETE" });
      setNotice("Task deleted.");
      await refreshData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteSubject(id) {
    if (!window.confirm("Delete this subject and all its tasks?")) return;

    try {
      await request(`/api/subjects/${id}`, { method: "DELETE" });
      setNotice("Subject deleted.");
      await refreshData();
    } catch (err) {
      setError(err.message);
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  const todayTasks = tasks.filter(
    task => !task.due_date || task.due_date === today
  );

  const upcomingExams = subjects
    .filter(s => s.exam_date && s.exam_date >= today)
    .sort((a, b) => a.exam_date.localeCompare(b.exam_date));

  const daysUntil = date => Math.ceil(
    (new Date(`${date}T00:00:00`) -
      new Date(`${today}T00:00:00`)) / 86400000
  );

  const completedToday = todayTasks.filter(t => t.completed).length;

  // Authentication screen
  if (!authChecked || (user && loading)) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-brand">
            <div className="brand-icon"><Zap size={25} /></div>
            <h1>StudySprint</h1>
            <p>Your personal study space 🌱</p>
          </div>
          <p className="auth-description">Loading your study space...</p>
        </div>
      </div>
    );
  }


  if (!user) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-brand">
            <div className="brand-icon"><Zap size={25} /></div>
            <h1>StudySprint</h1>
            <p>Your personal study space 🌱</p>
          </div>

          <h2>
            {authMode === "forgot"
              ? "Forgot password?"
              : authMode === "reset"
                ? "Reset your password"
                : authMode === "login"
                  ? "Welcome back!"
                  : "Create your account"}
          </h2>

          <p className="auth-description">
            {authMode === "forgot"
              ? "Enter your registered email to request a reset token."
              : authMode === "reset"
                ? "Enter the token from the backend terminal and choose a new password."
                : authMode === "login"
                  ? "Log in to continue your learning journey."
                  : "Start planning your studies and tracking your progress."}
          </p>

          {error && <div className="alert error">{error}</div>}
          {resetMessage && <div className="alert">{resetMessage}</div>}

          {authMode === "forgot" ? (
            <form className="form-stack" onSubmit={handleForgotPassword}>
              <label>
                Email address
                <input
                  type="email"
                  value={authEmail}
                  onChange={e => setAuthEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
              </label>

              <button className="primary-btn" disabled={authBusy}>
                {authBusy ? "Please wait..." : "Request reset token"}
              </button>
            </form>
          ) : authMode === "reset" ? (
            <form className="form-stack" onSubmit={handleResetPassword}>
              <label>
                Reset token
                <input
                  type="text"
                  value={resetToken}
                  onChange={e => setResetToken(e.target.value)}
                  placeholder="Paste token from backend terminal"
                  required
                />
              </label>

              <label>
                New password
                <input
                  type="password"
                  value={resetNewPassword}
                  onChange={e => setResetNewPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  required
                />
              </label>

              <button className="primary-btn" disabled={authBusy}>
                {authBusy ? "Please wait..." : "Change password"}
              </button>
            </form>
          ) : (
            <form className="form-stack" onSubmit={handleAuth}>
              <label>
                Email address
                <input
                  type="email"
                  value={authEmail}
                  onChange={e => setAuthEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
              </label>

              <label>
                Password
                <input
                  type="password"
                  value={authPassword}
                  onChange={e => setAuthPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  autoComplete={
                    authMode === "login" ? "current-password" : "new-password"
                  }
                  minLength={8}
                  maxLength={128}
                  required
                />
              </label>

              <button className="primary-btn" disabled={authBusy}>
                {authBusy
                  ? "Please wait..."
                  : authMode === "login"
                    ? "Log in"
                    : "Create account"}
              </button>
            </form>
          )}

          {authMode === "login" && (
            <p className="auth-switch">
              <button
                type="button"
                className="text-btn"
                onClick={() => {
                  setAuthMode("forgot");
                  setError("");
                  setResetMessage("");
                }}
              >
                Forgot password?
              </button>
            </p>
          )}

          {(authMode === "login" || authMode === "register") && (
            <p className="auth-switch">
              {authMode === "login"
                ? "New to StudySprint?"
                : "Already have an account?"}
              {" "}
              <button
                type="button"
                className="text-btn"
                onClick={() => {
                  setAuthMode(authMode === "login" ? "register" : "login");
                  setError("");
                  setResetMessage("");
                }}
              >
                {authMode === "login" ? "Create account" : "Log in"}
              </button>
            </p>
          )}

          {(authMode === "forgot" || authMode === "reset") && (
            <p className="auth-switch">
              {authMode === "forgot"
                ? "Already have a reset token?"
                : "Need another reset token?"}
              {" "}
              <button
                type="button"
                className="text-btn"
                onClick={() => {
                  setAuthMode(authMode === "forgot" ? "reset" : "forgot");
                  setError("");
                  setResetMessage("");
                }}
              >
                {authMode === "forgot" ? "Enter token" : "Request token"}
              </button>
            </p>
          )}
        </div>
      </div>
    );
  }


  // Main dashboard
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon"><Zap size={23} /></div>
          <div>
            <h2>StudySprint</h2>
            <span>YOUR GROWTH SPACE</span>
          </div>
        </div>

        <div className="nav-label">WORKSPACE</div>


        {[
          { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
          { id: "subjects", label: "My subjects", icon: BookOpen },
          { id: "tasks", label: "Study tasks", icon: CheckCircle2 },
          { id: "planner", label: "Smart planner", icon: CalendarClock },
          { id: "exams", label: "Exam calendar", icon: CalendarDays }
        ].map(item => {

          const Icon = item.icon;

          return (
            <button
              key={item.id}
              className={`nav-item ${activeTab === item.id ? "active" : ""}`}
              onClick={() => setActiveTab(item.id)}
            >
              <Icon size={19} />
              {item.label}
            </button>
          );
        })}

        <div className="sidebar-bottom">
          <div className="focus-card">
            <Target size={23} />
            <h3>Small steps. Big results.</h3>
            <p>Every focused session brings you closer to your goals.</p>
          </div>

          <div className="profile">
            <div className="avatar">
              {(user.email || "S").charAt(0).toUpperCase()}
            </div>
            <div className="profile-details">
              <strong>Student</strong>
              <span>{user.email}</span>
            </div>
          </div>

          <button className="nav-item" onClick={handleLogout}>
            <LogOut size={18} /> Log out
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <span className="eyebrow">YOUR PERSONAL STUDY SPACE</span>
            <h1>
              {activeTab === "dashboard" ? "Dashboard" :
                activeTab === "subjects" ? "My subjects" :
                  activeTab === "tasks" ? "Study tasks" : "Exam calendar"}
            </h1>
          </div>

          <button className="refresh-btn" onClick={refreshData}>
            <RefreshCw size={16} /> Refresh
          </button>
        </header>

        {error && <div className="alert error">{error}</div>}
        {notice && <div className="alert success">{notice}</div>}

        {activeTab === "dashboard" && (
          <>
            <section className="welcome-banner">
              <div>
                <span className="welcome-label">A FRESH START</span>
                <h2>Your goals, one session at a time. 🌱</h2>
                <p>Plan intentionally, study consistently, and track your progress.</p>
              </div>
              <div className="banner-art">
                <BookOpen size={76} strokeWidth={1.2} />
              </div>
            </section>

            <section className="stats-grid">
              <Stat icon={BookOpen} label="Subjects" value={stats.subjects}
                note="Your learning areas" color="purple" />
              <Stat icon={CheckCircle2} label="Tasks completed"
                value={`${stats.completed_tasks}/${stats.total_tasks}`}
                note="Across all your tasks" color="green" />
              <Stat icon={Target} label="Overall progress"
                value={`${stats.completion_percent}%`}
                note="Completion rate" color="orange" />
              <Stat icon={Clock3} label="Today's checklist"
                value={`${completedToday}/${todayTasks.length}`}
                note="Tasks due today or unscheduled" color="blue" />
            </section>

            <div className="content-grid">
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Today's study tasks</h2>
                    <p>Make today count.</p>
                  </div>
                  <button className="text-btn" onClick={() => setActiveTab("tasks")}>
                    View all →
                  </button>
                </div>

                {todayTasks.length === 0
                  ? <Empty message="No study tasks yet. Add one to get started." />
                  : todayTasks.map(task => (
                    <TaskRow key={task.id} task={task}
                      onToggle={toggleTask} onDelete={deleteTask} />
                  ))}
              </section>

              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Upcoming exams</h2>
                    <p>Stay one step ahead.</p>
                  </div>
                  <CalendarDays size={21} />
                </div>

                {upcomingExams.length === 0
                  ? <Empty message="Add an exam date to see your countdown." />
                  : upcomingExams.slice(0, 5).map(subject => (
                    <div className="exam-row" key={subject.id}>
                      <div className="exam-icon"><BookOpen size={19} /></div>
                      <div className="exam-info">
                        <strong>{subject.name}</strong>
                        <span>{subject.exam_date}</span>
                      </div>
                      <span className="days-pill">
                        {daysUntil(subject.exam_date) === 0
                          ? "Today"
                          : `${daysUntil(subject.exam_date)}d left`}
                      </span>
                    </div>
                  ))}
              </section>
            </div>

            <div className="content-grid lower-grid">
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Your progress</h2>
                    <p>Every completed task counts.</p>
                  </div>
                </div>

                <div className="progress-layout">
                  <div className="progress-ring"
                    style={{ "--progress": `${stats.completion_percent}%` }}>
                    <div>
                      <strong>{stats.completion_percent}%</strong>
                      <span>completed</span>
                    </div>
                  </div>
                  <div className="progress-details">
                    <p><span className="dot green-dot" /> Completed <strong>{stats.completed_tasks}</strong></p>
                    <p><span className="dot gray-dot" /> Remaining <strong>{stats.total_tasks - stats.completed_tasks}</strong></p>
                    <p><span className="dot purple-dot" /> Subjects <strong>{stats.subjects}</strong></p>
                  </div>
                </div>
              </section>

              <section className="panel quick-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Quick actions</h2>
                    <p>Build your next step.</p>
                  </div>
                </div>
                <button onClick={() => setActiveTab("subjects")}><Plus size={18} /> Add a subject</button>
                <button onClick={() => setActiveTab("tasks")}><CheckCircle2 size={18} /> Create a study task</button>
                <button onClick={() => setActiveTab("exams")}><CalendarDays size={18} /> View exam dates</button>
              </section>
            </div>
          </>
        )}

        {activeTab === "subjects" && (
          <div className="content-grid">
            <section className="panel">
              <div className="panel-heading">
                <div><h2>Add a subject</h2><p>Set up your learning goals.</p></div>
              </div>

              <form onSubmit={addSubject} className="form-stack">
                <label>Subject name
                  <input value={subjectName}
                    onChange={e => setSubjectName(e.target.value)}
                    placeholder="e.g. Data Structures" required />
                </label>
                <label>Exam date
                  <input type="date" min={today} value={examDate}
                    onChange={e => setExamDate(e.target.value)} />
                </label>
                <label>Study hours per day
                  <input type="number" min="1" max="16" value={dailyHours}
                    onChange={e => setDailyHours(e.target.value)} required />
                </label>
                <button className="primary-btn" disabled={busy}>
                  <Plus size={18} /> Add subject
                </button>
              </form>
            </section>

            <section className="panel">
              <div className="panel-heading">
                <div><h2>Your subjects</h2><p>{subjects.length} learning areas</p></div>
              </div>

              {subjects.length === 0
                ? <Empty message="Your subjects will appear here." />
                : subjects.map(subject => (
                  <div className="subject-row" key={subject.id}>
                    <div className="subject-icon"><BookOpen size={20} /></div>
                    <div className="subject-info">
                      <strong>{subject.name}</strong>
                      <span>
                        {subject.exam_date ? `Exam: ${subject.exam_date}` : "No exam date set"}
                        {" · "}{subject.daily_hours}h/day
                      </span>
                    </div>
                    <button className="icon-btn danger" title="Delete subject"
                      onClick={() => deleteSubject(subject.id)}>
                      <Trash2 size={17} />
                    </button>
                  </div>
                ))}
            </section>
          </div>
        )}

        {activeTab === "tasks" && (
          <div className="content-grid">
            <section className="panel">
              <div className="panel-heading">
                <div><h2>Create a study task</h2><p>Turn a goal into an action.</p></div>
              </div>

              <form onSubmit={addTask} className="form-stack">
                <label>Task title
                  <input value={taskTitle}
                    onChange={e => setTaskTitle(e.target.value)}
                    placeholder="e.g. Revise binary trees" required />
                </label>
                <label>Subject
                  <select value={taskSubject}
                    onChange={e => setTaskSubject(e.target.value)} required>
                    <option value="">Choose a subject</option>
                    {subjects.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </label>
                <label>Due date
                  <input type="date" min={today} value={taskDate}
                    onChange={e => setTaskDate(e.target.value)} />
                </label>
                <button className="primary-btn" disabled={busy || subjects.length === 0}>
                  <Plus size={18} /> Add task
                </button>
                {subjects.length === 0 &&
                  <p className="hint">Add a subject before creating a task.</p>}
              </form>
            </section>

            <section className="panel">
              <div className="panel-heading">
                <div><h2>All study tasks</h2><p>{tasks.length} tasks in total</p></div>
              </div>

              {tasks.length === 0
                ? <Empty message="Your study checklist is waiting for its first task." />
                : tasks.map(task => (
                  <TaskRow key={task.id} task={task}
                    onToggle={toggleTask} onDelete={deleteTask} />
                ))}
            </section>
          </div>
        )}

        {activeTab === "exams" && (
          <section className="panel">
            <div className="panel-heading">
              <div><h2>Exam calendar</h2><p>Upcoming exams for your subjects.</p></div>
            </div>

            {upcomingExams.length === 0
              ? <Empty message="No upcoming exams. Add exam dates in My subjects." />
              : upcomingExams.map(subject => (
                <div className="exam-row" key={subject.id}>
                  <div className="exam-icon"><CalendarDays size={20} /></div>
                  <div className="exam-info">
                    <strong>{subject.name}</strong>
                    <span>{subject.exam_date}</span>
                  </div>
                  <span className="days-pill">
                    {daysUntil(subject.exam_date) === 0
                      ? "Today"
                      : `${daysUntil(subject.exam_date)} days left`}
                  </span>
                </div>
              ))}
          </section>
        )}

        {activeTab === "planner" && (() => {
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          const pendingTasks = tasks.filter(task => !task.completed);

          const plannedSubjects = [...subjects]
            .map(subject => {
              const examDate = subject.exam_date
                ? new Date(subject.exam_date)
                : null;

              const daysLeft = examDate && !Number.isNaN(examDate.getTime())
                ? Math.ceil((examDate.setHours(0, 0, 0, 0) - today.getTime()) / 86400000)
                : null;

              const subjectTasks = pendingTasks.filter(
                task => Number(task.subject_id) === Number(subject.id)
              );

              return { ...subject, daysLeft, subjectTasks };
            })
            .sort((a, b) => {
              if (a.daysLeft == null) return 1;
              if (b.daysLeft == null) return -1;
              return a.daysLeft - b.daysLeft;
            });

          const totalHours = plannedSubjects.reduce(
            (sum, subject) => sum + (Number(subject.daily_hours) || 0),
            0
          );

          return (
            <section className="planner-page">
              <div className="planner-heading">
                <div>
                  <h2>Smart Study Planner</h2>
                  <p>Your study priorities, based on your exams and pending tasks.</p>
                </div>
                <CalendarClock size={30} />
              </div>

              <div className="planner-summary">
                <article>
                  <span>Your subjects</span>
                  <h3>{subjects.length}</h3>
                </article>
                <article>
                  <span>Pending tasks</span>
                  <h3>{pendingTasks.length}</h3>
                </article>
                <article>
                  <span>Daily study hours</span>
                  <h3>{totalHours}</h3>
                </article>
              </div>

              <div className="planner-card">
                <h3><Target size={19} /> Recommended priorities</h3>

                {plannedSubjects.length === 0 ? (
                  <p>Add a subject in My Subjects to generate your study plan.</p>
                ) : (
                  plannedSubjects.map((subject, index) => (
                    <div className="planner-row" key={subject.id}>
                      <div className="planner-number">{index + 1}</div>
                      <div className="planner-info">
                        <strong>{subject.name}</strong>
                        <p>
                          {subject.daysLeft == null
                            ? "No exam date set"
                            : subject.daysLeft < 0
                              ? "Exam date has passed"
                              : subject.daysLeft === 0
                                ? "Exam is today"
                                : `${subject.daysLeft} day${subject.daysLeft === 1 ? "" : "s"} until exam`}
                          {" · "}
                          {subject.subjectTasks.length} pending task
                          {subject.subjectTasks.length === 1 ? "" : "s"}
                        </p>
                      </div>
                      <span className="planner-priority">
                        {subject.daysLeft !== null &&
                          subject.daysLeft >= 0 &&
                          subject.daysLeft <= 7
                          ? "High priority"
                          : subject.subjectTasks.length > 0
                            ? "Study next"
                            : "Revision"}
                      </span>
                    </div>
                  ))
                )}
              </div>

              <div className="planner-card">
                <h3><Clock3 size={19} /> Today's action list</h3>

                {pendingTasks.length === 0 ? (
                  <p>No pending tasks! Add a task to get a study recommendation.</p>
                ) : (
                  [...pendingTasks]
                    .sort((a, b) => {
                      const subjectA = plannedSubjects.find(
                        s => Number(s.id) === Number(a.subject_id)
                      );
                      const subjectB = plannedSubjects.find(
                        s => Number(s.id) === Number(b.subject_id)
                      );

                      return (subjectA?.daysLeft ?? Infinity) -
                        (subjectB?.daysLeft ?? Infinity);
                    })
                    .slice(0, 5)
                    .map(task => (
                      <div className="planner-row" key={task.id}>
                        <div className="planner-number">
                          <CheckCircle2 size={18} />
                        </div>
                        <div className="planner-info">
                          <strong>{task.title}</strong>
                          <p>
                            {task.subject_name || "Your subject"}
                            {task.due_date ? ` · Due ${task.due_date}` : ""}
                          </p>
                        </div>
                      </div>
                    ))
                )}
              </div>
            </section>
          );
        })()}


        <footer>StudySprint · Build your consistency, one day at a time.</footer>
      </main>
    </div>
  );
}

function Stat({ icon: Icon, label, value, note, color }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${color}`}><Icon size={21} /></div>
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      <span className="stat-note">{note}</span>
    </div>
  );
}

function TaskRow({ task, onToggle, onDelete }) {
  return (
    <div className={`task-row ${task.completed ? "task-completed" : ""}`}>
      <button
        className={`task-check ${task.completed ? "checked" : ""}`}
        onClick={() => onToggle(task)}
        aria-label="Toggle task completion"
      >
        {task.completed && <CheckCircle2 size={17} />}
      </button>
      <div className="task-info">
        <strong>{task.title}</strong>
        <span>{task.subject_name}{task.due_date ? ` · Due ${task.due_date}` : ""}</span>
      </div>
      <button className="icon-btn" title="Delete task"
        onClick={() => onDelete(task.id)}>
        <Trash2 size={16} />
      </button>
    </div>
  );
}

function Empty({ message }) {
  return (
    <div className="empty-state">
      <BookOpen size={25} />
      <p>{message}</p>
    </div>
  );
}

export default App;
