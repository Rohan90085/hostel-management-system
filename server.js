// const express = require("express");
// const { Pool } = require("pg");

// const app = express();

// // Middleware
// app.use(express.urlencoded({ extended: false }));
// app.use(express.json());

// // EJS setup
// app.set("view engine", "ejs");
// app.set("views", "views");

// // PostgreSQL Connection
// const pool = new Pool({
//     user: "postgres",
//     host: "localhost",
//     database: "hostel",
//     password: "Rohanph@900",
//     port: 5432
// });

// // SHOW FORM + USER LIST
// app.get("/", async (req, res) => {
//     const result = await pool.query("SELECT * FROM users ORDER BY id DESC");
//     res.render("index", { users: result.rows });
// });

// // INSERT NEW USER
// app.post("/user/add", async (req, res) => {
//     const { name, email } = req.body;

//     await pool.query(
//         "INSERT INTO users (name, email) VALUES ($1, $2)",
//         [name, email]
//     );

//     res.redirect("/");   // go back to EJS page
// });

// // Start Server
// app.listen(3000, () => {
//     console.log("Server running on http://localhost:3000");
// });
const express = require("express");
const { Pool } = require("pg");
const app = express();

const pool = new Pool({
    user: "postgres",
    host: "localhost",
    database: "hostel",
    password: "Rohanph@900",
    port: 5432
});

app.set("view engine", "ejs");
 app.set("views", "views");
app.use(express.urlencoded({ extended: true }));
app.use(express.json());


// HOME PAGE
app.get("/", async (req, res) => {
    const students = await pool.query("SELECT * FROM students ORDER BY id ASC");
    const rooms = await pool.query("SELECT * FROM rooms ORDER BY id ASC");
    const allocations = await pool.query(`
        SELECT a.id, s.name, r.room_no, a.date_allocated
        FROM allocations a
        JOIN students s ON a.student_id = s.id
        JOIN rooms r ON a.room_id = r.id
        ORDER BY a.id ASC
    `);

    const availableRooms = await pool.query(
        "SELECT * FROM rooms WHERE occupied < capacity"
    );

    res.render("home", {
        students: students.rows,
        rooms: rooms.rows,
        allocations: allocations.rows,
        availableRooms: availableRooms.rows
    });
});

// ADD STUDENT
app.post("/students/add", async (req, res) => {
    const { name, phone, gender } = req.body;
    await pool.query(
        "INSERT INTO students (name, phone, gender) VALUES ($1, $2, $3)",
        [name, phone, gender]
    );
    res.redirect("/");
});

// DELETE STUDENT
app.get("/students/delete/:id", async (req, res) => {
    await pool.query("DELETE FROM students WHERE id = $1", [req.params.id]);
    res.redirect("/");
});

// ADD ROOM
app.post("/rooms/add", async (req, res) => {
    const { room_no, capacity } = req.body;

    await pool.query(
        "INSERT INTO rooms (room_no, capacity, occupied) VALUES ($1, $2, 0)",
        [room_no, capacity]
    );
    res.redirect("/");
});

// DELETE ROOM
app.get("/rooms/delete/:id", async (req, res) => {
    await pool.query("DELETE FROM rooms WHERE id = $1", [req.params.id]);
    res.redirect("/");
});

// ALLOCATE ROOM
app.post("/allocate", async (req, res) => {
    const { student_id, room_id } = req.body;

    await pool.query(
        "INSERT INTO allocations (student_id, room_id) VALUES ($1, $2)",
        [student_id, room_id]
    );

    await pool.query(
        "UPDATE rooms SET occupied = occupied + 1 WHERE id = $1",
        [room_id]
    );

    res.redirect("/");
});

// DELETE ALLOCATION
app.get("/allocations/delete/:id", async (req, res) => {
    const id = req.params.id;

    const room = await pool.query(
        "SELECT room_id FROM allocations WHERE id = $1",
        [id]
    );

    await pool.query("DELETE FROM allocations WHERE id = $1", [id]);

    await pool.query(
        "UPDATE rooms SET occupied = occupied - 1 WHERE id = $1",
        [room.rows[0].room_id]
    );

    res.redirect("/");
});
app.post("/students/search", async (req, res) => {
    const { keyword } = req.body;

    const result = await pool.query(
        `SELECT * FROM students 
         WHERE CAST(id AS TEXT) = $1
         OR LOWER(name) LIKE LOWER($2)`,
        [keyword, `%${keyword}%`]
    );

    res.json(result.rows);
});


app.listen(3000, () => console.log("Running on http://localhost:3000"));
