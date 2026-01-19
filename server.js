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
    try {
        const students = await pool.query("SELECT * FROM students ORDER BY id ASC");
        const rooms = await pool.query("SELECT * FROM rooms ORDER BY id ASC");
        const allocations = await pool.query(`
            SELECT a.id, s.id as student_id, s.name, r.room_no, a.date_allocated
            FROM allocations a
            JOIN students s ON a.student_id = s.id
            JOIN rooms r ON a.room_id = r.id
            ORDER BY a.id ASC
        `);

        // Get only unallocated students for the dropdown
        const unallocatedStudents = await pool.query(`
            SELECT s.* FROM students s
            LEFT JOIN allocations a ON s.id = a.student_id
            WHERE a.student_id IS NULL
            ORDER BY s.id ASC
        `);

        const availableRooms = await pool.query(
            "SELECT * FROM rooms WHERE occupied < capacity ORDER BY room_no ASC"
        );

        res.render("home", {
            students: students.rows,
            rooms: rooms.rows,
            allocations: allocations.rows,
            availableRooms: availableRooms.rows,
            unallocatedStudents: unallocatedStudents.rows
        });
    } catch (error) {
        console.error('Home page error:', error);
        res.status(500).send('Server error');
    }
});

// ADD STUDENT
app.post("/students/add", async (req, res) => {
    try {
        const { name, phone, gender } = req.body;
        await pool.query(
            "INSERT INTO students (name, phone, gender) VALUES ($1, $2, $3)",
            [name, phone, gender]
        );
        res.redirect("/?success=student_added");
    } catch (error) {
        console.error(error);
        res.redirect("/?error=add_student_failed");
    }
});

// DELETE STUDENT
app.get("/students/delete/:id", async (req, res) => {
    try {
        await pool.query("DELETE FROM students WHERE id = $1", [req.params.id]);
        res.redirect("/?success=student_deleted");
    } catch (error) {
        console.error(error);
        res.redirect("/?error=delete_student_failed");
    }
});

// ADD ROOM
app.post("/rooms/add", async (req, res) => {
    try {
        const { room_no, capacity } = req.body;
        await pool.query(
            "INSERT INTO rooms (room_no, capacity, occupied) VALUES ($1, $2, 0)",
            [room_no, capacity]
        );
        res.redirect("/?success=room_added");
    } catch (error) {
        console.error(error);
        res.redirect("/?error=room_exists_or_failed");
    }
});

// DELETE ROOM
app.get("/rooms/delete/:id", async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // Check if room has allocations
        const allocCheck = await client.query(
            "SELECT COUNT(*) FROM allocations WHERE room_id = $1",
            [req.params.id]
        );
        
        if (parseInt(allocCheck.rows[0].count) > 0) {
            await client.query('ROLLBACK');
            return res.redirect("/?error=delete_room_has_allocations");
        }
        
        await client.query("DELETE FROM rooms WHERE id = $1", [req.params.id]);
        await client.query('COMMIT');
        res.redirect("/?success=room_deleted");
    } catch (error) {
        await client.query('ROLLBACK');
        console.error(error);
        res.redirect("/?error=delete_room_failed");
    } finally {
        client.release();
    }
});

// ALLOCATE ROOM - FIXED WITH PROPER OCCUPIED UPDATE
app.post("/allocate", async (req, res) => {
    const client = await pool.connect();
    
    try {
        const { student_id, room_id } = req.body;

        if (!student_id || !room_id) {
            return res.redirect("/?error=missing_data");
        }

        await client.query('BEGIN');

        // Check if student already has a room
        const existingAllocation = await client.query(
            "SELECT * FROM allocations WHERE student_id = $1",
            [student_id]
        );

        if (existingAllocation.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.redirect("/?error=student_already_allocated");
        }

        // Check if room has available space
        const room = await client.query(
            "SELECT * FROM rooms WHERE id = $1",
            [room_id]
        );

        if (room.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.redirect("/?error=room_not_found");
        }

        if (room.rows[0].occupied >= room.rows[0].capacity) {
            await client.query('ROLLBACK');
            return res.redirect("/?error=room_full");
        }

        // Perform allocation
        await client.query(
            "INSERT INTO allocations (student_id, room_id) VALUES ($1, $2)",
            [student_id, room_id]
        );

        // Update room occupied count
        const updateResult = await client.query(
            "UPDATE rooms SET occupied = occupied + 1 WHERE id = $1 RETURNING *",
            [room_id]
        );

        console.log('Room updated:', updateResult.rows[0]); // Debug log

        await client.query('COMMIT');
        res.redirect("/?success=room_allocated");

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Allocation error:', error);
        res.redirect("/?error=allocation_failed");
    } finally {
        client.release();
    }
});

// DELETE ALLOCATION - FIXED WITH PROPER OCCUPIED UPDATE
app.get("/allocations/delete/:id", async (req, res) => {
    const client = await pool.connect();
    
    try {
        const id = req.params.id;

        await client.query('BEGIN');

        // Get the allocation details before deleting
        const allocation = await client.query(
            "SELECT room_id FROM allocations WHERE id = $1",
            [id]
        );

        if (allocation.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.redirect("/?error=allocation_not_found");
        }

        const roomId = allocation.rows[0].room_id;

        // Delete the allocation
        await client.query("DELETE FROM allocations WHERE id = $1", [id]);

        // Decrease room occupied count
        const updateResult = await client.query(
            "UPDATE rooms SET occupied = GREATEST(occupied - 1, 0) WHERE id = $1 RETURNING *",
            [roomId]
        );

        console.log('Room updated after deletion:', updateResult.rows[0]); // Debug log

        await client.query('COMMIT');
        res.redirect("/?success=allocation_deleted");

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Delete allocation error:', error);
        res.redirect("/?error=delete_allocation_failed");
    } finally {
        client.release();
    }
});

// SEARCH STUDENT - WITH ROOM NUMBER
app.post("/students/search", async (req, res) => {
    try {
        const { keyword } = req.body;

        const result = await pool.query(
            `SELECT s.id, s.name, s.phone, s.gender, r.room_no
             FROM students s
             LEFT JOIN allocations a ON s.id = a.student_id
             LEFT JOIN rooms r ON a.room_id = r.id
             WHERE CAST(s.id AS TEXT) = $1
             OR LOWER(s.name) LIKE LOWER($2)`,
            [keyword, `%${keyword}%`]
        );

        res.json(result.rows);
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: 'Search failed' });
    }
});


app.listen(3000, () => console.log(" Running on>> http://localhost:3000"));
