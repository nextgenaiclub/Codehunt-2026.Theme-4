const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const admin = require('firebase-admin');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer configuration for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (extname && mimetype) {
            return cb(null, true);
        }
        cb(new Error('Only .jpg, .jpeg, and .png files are allowed'));
    }
});

// ============================================
// FIREBASE INITIALIZATION
// ============================================
let db;
let useFirebase = false;

// Check if Firebase credentials file exists or env var is set
const serviceAccountPath = path.join(__dirname, 'firebase-credentials.json');
if (process.env.FIREBASE_CREDENTIALS) {
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        db = admin.firestore();
        useFirebase = true;
        console.log('✅ Firebase Firestore connected via env variable!');
    } catch (error) {
        console.error('❌ Firebase env parse error:', error.message);
    }
} else if (fs.existsSync(serviceAccountPath)) {
    try {
        const serviceAccount = require(serviceAccountPath);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        db = admin.firestore();
        useFirebase = true;
        console.log('✅ Firebase Firestore connected successfully!');
    } catch (error) {
        console.error('❌ Firebase initialization error:', error.message);
        console.log('⚠️  Falling back to in-memory database');
    }
} else {
    console.log('⚠️  firebase-credentials.json not found');
    console.log('📝 To use Firebase:');
    console.log('   1. Go to Firebase Console → Project Settings → Service Accounts');
    console.log('   2. Generate new private key');
    console.log('   3. Save as backend/firebase-credentials.json');
    console.log('');
    console.log('📦 Using in-memory database for now...\n');
}

// ============================================
// IN-MEMORY DATABASE (Fallback)
// ============================================
const teamsDB = new Map();

// ============================================
// DATABASE HELPER FUNCTIONS
// ============================================

// Get team by name
async function getTeamByName(teamName) {
    const normalizedName = teamName.toLowerCase();

    if (useFirebase) {
        const snapshot = await db.collection('teams')
            .where('teamName', '==', normalizedName)
            .limit(1)
            .get();

        if (snapshot.empty) return null;
        return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
    } else {
        for (const [id, team] of teamsDB) {
            if (team.teamName === normalizedName) {
                return team;
            }
        }
        return null;
    }
}

// Get team by ID
async function getTeamById(teamId) {
    if (useFirebase) {
        const doc = await db.collection('teams').doc(teamId).get();
        if (!doc.exists) return null;
        return { id: doc.id, ...doc.data() };
    } else {
        return teamsDB.get(teamId) || null;
    }
}

// Save team - handles both flat and nested updates
async function saveTeam(teamId, teamData) {
    if (useFirebase) {
        try {
            // Flatten nested objects to dot notation for Firebase update()
            const flattenObject = (obj, prefix = '') => {
                return Object.keys(obj).reduce((acc, key) => {
                    const newKey = prefix ? `${prefix}.${key}` : key;
                    if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key]) && !(obj[key] instanceof Date)) {
                        Object.assign(acc, flattenObject(obj[key], newKey));
                    } else {
                        acc[newKey] = obj[key];
                    }
                    return acc;
                }, {});
            };

            const flatData = flattenObject(teamData);

            // Use update() for partial updates - this properly handles nested fields
            await db.collection('teams').doc(teamId).update(flatData);
        } catch (error) {
            console.error('Firebase saveTeam error:', error.message);
            throw error;
        }
    } else {
        // For in-memory, deep merge the updates
        const existingTeam = teamsDB.get(teamId) || {};

        const deepMerge = (target, source) => {
            for (const key in source) {
                if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                    if (!target[key]) target[key] = {};
                    deepMerge(target[key], source[key]);
                } else {
                    target[key] = source[key];
                }
            }
            return target;
        };

        deepMerge(existingTeam, teamData);
        teamsDB.set(teamId, existingTeam);
    }
}

// Create team
async function createTeam(teamId, teamData) {
    if (useFirebase) {
        await db.collection('teams').doc(teamId).set(teamData);
    } else {
        teamsDB.set(teamId, teamData);
    }
}

// Get all teams
async function getAllTeams() {
    if (useFirebase) {
        const snapshot = await db.collection('teams').get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } else {
        return Array.from(teamsDB.values());
    }
}

// Get completed teams for leaderboard
async function getCompletedTeams() {
    if (useFirebase) {
        const snapshot = await db.collection('teams')
            .where('phase6.completed', '==', true)
            .limit(10)
            .get();
        return snapshot.docs.map(doc => ({
            teamId: doc.id,
            teamName: doc.data().teamName,
            teamLeader: doc.data().teamLeader
        }));
    } else {
        const completedTeams = [];
        for (const [id, team] of teamsDB) {
            if (team.phase6?.completed) {
                completedTeams.push({
                    teamId: team.teamId,
                    teamName: team.teamName,
                    teamLeader: team.teamLeader
                });
            }
        }
        return completedTeams.slice(0, 10);
    }
}

// Get stats
async function getStats() {
    if (useFirebase) {
        const snapshot = await db.collection('teams').get();
        let stats = {
            totalTeams: 0,
            phase1: 0, phase2: 0, phase3: 0, phase4: 0, phase5: 0, phase6: 0
        };

        snapshot.forEach(doc => {
            const team = doc.data();
            stats.totalTeams++;
            if (team.phase1?.completed) stats.phase1++;
            if (team.phase2?.completed) stats.phase2++;
            if (team.phase3?.completed) stats.phase3++;
            if (team.phase4?.completed) stats.phase4++;
            if (team.phase5?.completed) stats.phase5++;
            if (team.phase6?.completed) stats.phase6++;
        });

        return stats;
    } else {
        let stats = {
            totalTeams: 0,
            phase1: 0, phase2: 0, phase3: 0, phase4: 0, phase5: 0, phase6: 0
        };

        for (const [id, team] of teamsDB) {
            stats.totalTeams++;
            if (team.phase1?.completed) stats.phase1++;
            if (team.phase2?.completed) stats.phase2++;
            if (team.phase3?.completed) stats.phase3++;
            if (team.phase4?.completed) stats.phase4++;
            if (team.phase5?.completed) stats.phase5++;
            if (team.phase6?.completed) stats.phase6++;
        }

        return stats;
    }
}

// ============================================
// QUESTIONS DATA
// ============================================

// Quiz Questions for Phase 2
const phase2Questions = [
    {
        id: 1,
        question: "Intelligent tutoring systems mainly provide:",
        options: ["Fixed lessons", "Only video lectures", "Personalized instruction", "Manual grading"],
        correctAnswer: 2
    },
    {
        id: 2,
        question: "AI grading tools help teachers by:",
        options: ["Automating assessment", "Removing exams", "Increasing workload", "Preventing feedback"],
        correctAnswer: 0
    },
    {
        id: 3,
        question: "Which technology enables real-time lecture transcription?",
        options: ["Computer Vision", "Blockchain", "Speech Recognition", "Data Mining"],
        correctAnswer: 2
    },
    {
        id: 4,
        question: "Adaptive learning platforms adjust based on:",
        options: ["Teacher salary", "School building size", "Internet speed", "Student performance"],
        correctAnswer: 3
    },
    {
        id: 5,
        question: "AI can identify struggling students through:",
        options: ["Random selection", "Learning analytics", "Manual counting", "Attendance guessing"],
        correctAnswer: 1
    },
    {
        id: 6,
        question: "Chatbots in education are useful for:",
        options: ["Cancelling homework", "Closing libraries", "Answering student queries 24/7", "Replacing textbooks completely"],
        correctAnswer: 2
    },
    {
        id: 7,
        question: "Which is a risk of AI in education?",
        options: ["Faster feedback", "Personalized study", "Better accessibility", "Algorithmic bias"],
        correctAnswer: 3
    },
    {
        id: 8,
        question: "AI translation tools help students by:",
        options: ["Removing teachers", "Limiting resources", "Blocking communication", "Breaking language barriers"],
        correctAnswer: 3
    },
    {
        id: 9,
        question: "Automated scheduling systems optimize:",
        options: ["Playground size", "Classroom paint", "Uniform design", "Timetable creation"],
        correctAnswer: 3
    },
    {
        id: 10,
        question: "Gamified AI learning platforms improve:",
        options: ["Student boredom", "Network latency", "Engagement and motivation", "Paper usage"],
        correctAnswer: 2
    }
];

// Phase 3 Questions
const phase3Questions = [
    {
        id: 1,
        code: `#include <stdio.h>\nint main() {\n    int x = 5, y = 2;\n    int result = x++ * --y;\n    printf("%d %d %d", result, x, y);\n    return 0;\n}`,
        question: "What will be the output of this code?",
        options: ["5 6 1", "10 6 1", "5 5 2", "10 5 1"],
        correctAnswer: 0
    },
    {
        id: 2,
        code: `#include <stdio.h>\nint main() {\n    int i = 0, count = 0;\n    while (i < 10) {\n        i += 3;\n        if (i == 9)\n            break;\n        count++;\n    }\n    printf("%d %d", count, i);\n    return 0;\n}`,
        question: "What will be the output of this code?",
        options: ["3 9", "2 9", "3 12", "2 6"],
        correctAnswer: 1
    },
    {
        id: 3,
        code: `#include <stdio.h>\nint main() {\n    int a = 12, b = 5;\n    printf("%d %d %d", a & b, a | b, a ^ b);\n    return 0;\n}`,
        question: "What will be the output of this code?",
        options: ["4 13 9", "5 12 7", "4 12 9", "0 17 8"],
        correctAnswer: 0
    },
    {
        id: 4,
        code: `#include <stdio.h>\nint main() {\n    int arr[2][3] = {{1, 2, 3}, {4, 5, 6}};\n    printf("%d ", arr[0][2] + arr[1][0]);\n    printf("%d", arr[1][2] - arr[0][1]);\n    return 0;\n}`,
        question: "What will be the output of this code?",
        options: ["7 4", "5 3", "8 4", "6 5"],
        correctAnswer: 0
    },
    {
        id: 5,
        code: `#include <stdio.h>\nint main() {\n    int a = 3, b = 7, c = 5;\n    int max = (a > b) ? a : (b > c) ? b : c;\n    int min = (a < b) ? (a < c) ? a : c : (b < c) ? b : c;\n    printf("%d %d", max, min);\n    return 0;\n}`,
        question: "What will be the output of this code?",
        options: ["3 7", "5 3", "7 3", "7 5"],
        correctAnswer: 2
    }
];

// Phase 4 Buggy Code
const phase4Code = `#include <stdio.h>

int main() {
    int arr[6] = {4, -2, 7, -1, 8, 3};
    int i, sum = 0, count = 0;

    for (i = 0; i <= 6; i++) {
        if (arr[i] > 0) {
            sum += arr[i]
            count++;
        }
    }

    prinf("Positive sum: %d, Count: %d", sum, count);
    return 0;
}`;

const phase4Hints = [
    "Check the loop condition carefully — the array has 6 elements, so valid indices are 0 to 5",
    "Look for a missing semicolon on the sum += arr[i] line",
    "Is 'prinf' a valid C function? Check the spelling",
    "Positive numbers in the array: 4, 7, 8, 3 → Sum = 22, Count = 4"
];

// Phase 5 Riddles - 3 Challenges (ALL required to pass)
const phase5Riddles = [
    {
        id: 1,
        type: "mcq",
        riddle: "Study the maze below and find the ONLY path from S (Start) to E (Exit). Walls (#) block movement. You can only move Right (→) or Down (↓).\n\n    C0  C1  C2  C3  C4  C5\nR0: [S] [.] [#] [.] [.] [.]\nR1: [#] [.] [.] [#] [.] [#]\nR2: [.] [#] [.] [.] [.] [.]\nR3: [.] [.] [#] [#] [#] [.]\nR4: [#] [.] [.] [.] [#] [.]\nR5: [.] [#] [.] [.] [.] [E]\n\nWhich sequence of moves leads from S to E?",
        options: [
            "→ ↓ → → ↓ → → ↓ ↓ ↓",
            "→ ↓ ↓ → → → ↓ → ↓ ↓",
            "→ ↓ → ↓ → → → ↓ ↓ ↓",
            "↓ → → ↓ → → → ↓ ↓ ↓"
        ],
        correctAnswer: 2
    },
    {
        id: 2,
        type: "mcq",
        riddle: "LOGICAL DEDUCTION: Each AI Learning Tool is assigned exactly one Educational Function.\n\nAI Learning Tools (Numbered):\n  1. LearnMate\n  2. QuizGen\n  3. SmartTutor\n  4. SkillTrack\n\nEducational Functions (Labeled):\n  A. Personalized Learning\n  B. Assessment & Quizzes\n  C. Progress Tracking\n  D. Doubt Resolution\n\nClues:\n  • QuizGen (2) is assigned to Assessment & Quizzes (B)\n  • LearnMate (1) is assigned to Personalized Learning (A)\n  • SkillTrack (4) is NOT assigned to A or B\n  • SmartTutor (3) is assigned to Doubt Resolution (D)\n\nWhat is the correct mapping?",
        options: [
            "LearnMate→A, QuizGen→B, SmartTutor→C, SkillTrack→D",
            "LearnMate→B, QuizGen→A, SmartTutor→D, SkillTrack→C",
            "LearnMate→A, QuizGen→B, SmartTutor→D, SkillTrack→C",
            "LearnMate→D, QuizGen→B, SmartTutor→A, SkillTrack→C"
        ],
        correctAnswer: 2
    },
    {
        id: 3,
        type: "text",
        riddle: "PATTERN RECOGNITION\n\nStep 1 — Given Values:\n  A = 6,  B = 1,  C = 2,  D = 3\n\nStep 2 — Solve these expressions in order:\n  1) (2 × B)\n  2) (2 × A)\n  3) (2 × C)\n  4) (7 × B)\n  5) (2)\n\nStep 3 — Convert the obtained numbers using A1–Z26\n  (A=1, B=2, C=3 ... Z=26)\n  If a number is already a single digit, keep it as-is.\n\nWhat is the decoded keyword?",
        acceptedAnswers: ["BLDG 2", "BLDG2", "bldg 2", "bldg2", "Bldg 2", "Bldg2"]
    }
];

// ============================================
// API ROUTES
// ============================================

// Register new team (Phase 1)
app.post('/api/teams/register', async (req, res) => {
    try {
        const { teamName, teamLeader, teamMembers, email, theme } = req.body;

        // Validate required fields
        if (!teamName || !teamLeader || !teamMembers || !email || !theme) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: 'Invalid email format' });
        }

        // Validate theme
        const validThemes = [
            'AI in Healthcare',
            'Generative AI & Creativity',
            'Computer Science Fundamentals',
            'AI in Education & Learning',
            'AI in Smart Cities'
        ];
        if (!validThemes.includes(theme)) {
            return res.status(400).json({ error: 'Please select a valid theme' });
        }

        // Validate team members (3-4)
        const members = teamMembers.split(',').map(m => m.trim()).filter(m => m);
        if (members.length < 3 || members.length > 4) {
            return res.status(400).json({ error: 'Team must have 3-4 members' });
        }

        // Check if team name already exists
        const existingTeam = await getTeamByName(teamName);
        if (existingTeam) {
            return res.status(400).json({ error: 'Team name already exists' });
        }

        const teamId = 'TEAM_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

        const team = {
            teamId,
            teamName: teamName.toLowerCase(),
            teamLeader,
            teamMembers: members,
            email,
            theme,
            phase1: { completed: false },
            phase2: { completed: false },
            phase3: { completed: false },
            phase4: { completed: false },
            phase5: { completed: false },
            phase6: { completed: false },
            currentPhase: 1
        };

        await createTeam(teamId, team);

        console.log(`✅ Team registered: ${teamName} (Theme: ${theme}) ${useFirebase ? '(Firebase)' : '(Memory)'}`);

        res.json({
            success: true,
            message: 'Registration successful!',
            team
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Server error during registration' });
    }
});

// Submit Phase 1 (AI Image Generation)
app.post('/api/phase1/submit', async (req, res) => {
    try {
        const { teamId, driveLink, aiPrompt } = req.body;

        if (!teamId || !aiPrompt) {
            return res.status(400).json({ error: 'Team ID and AI prompt are required' });
        }

        const team = await getTeamById(teamId);
        if (!team) {
            return res.status(404).json({ error: 'Team not found' });
        }

        if (team.phase1?.completed) {
            return res.status(400).json({ error: 'Phase 1 already completed' });
        }

        if (team.currentPhase !== 1) {
            return res.status(400).json({ error: 'Not on Phase 1' });
        }

        // Validate AI prompt contains VU2050
        if (!aiPrompt.toUpperCase().includes('VU2050')) {
            return res.status(400).json({ error: 'AI Prompt must contain keyword "VU2050"' });
        }

        await saveTeam(teamId, {
            phase1: {
                aiPrompt,
                completed: true
            },
            currentPhase: 2
        });

        console.log(`🎨 Phase 1 - Team: ${team.teamName} submitted AI image!`);

        res.json({
            success: true,
            message: 'Phase 1 completed!'
        });
    } catch (error) {
        console.error('Phase 1 submit error:', error.message);
        res.status(500).json({ error: 'Server error: ' + error.message });
    }
});

// Get team by name (for resume)
app.get('/api/teams/:teamName', async (req, res) => {
    try {
        const team = await getTeamByName(req.params.teamName);
        if (!team) {
            return res.status(404).json({ error: 'Team not found' });
        }
        res.json(team);
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Get Phase 2 questions
app.get('/api/phase2/questions', (req, res) => {
    const questionsWithoutAnswers = phase2Questions.map(q => ({
        id: q.id,
        question: q.question,
        options: q.options
    }));
    res.json(questionsWithoutAnswers);
});

// Check single Phase 2 answer
app.post('/api/phase2/check-answer', (req, res) => {
    try {
        const body = req.body || {};
        const questionIndex = body.questionIndex;
        const answer = body.answer;

        if (questionIndex == null || answer == null) {
            return res.status(400).json({ error: 'questionIndex and answer are required' });
        }

        if (questionIndex < 0 || questionIndex >= phase2Questions.length) {
            return res.status(400).json({ error: 'Invalid question index' });
        }

        const question = phase2Questions[questionIndex];
        const correct = answer === question.correctAnswer;

        res.json({ success: true, correct });
    } catch (error) {
        console.error('Phase 2 check-answer error:', error.message);
        res.status(500).json({ error: 'Server error' });
    }
});

// Complete Phase 2 (all questions answered correctly)
app.post('/api/phase2/complete', async (req, res) => {
    try {
        const { teamId } = req.body;

        const team = await getTeamById(teamId);
        if (!team) {
            return res.status(404).json({ error: 'Team not found' });
        }

        if (team.phase2?.completed) {
            return res.status(400).json({ error: 'Phase 2 already completed' });
        }

        await saveTeam(teamId, {
            phase2: {
                completed: true
            },
            currentPhase: 3
        });

        console.log(`📝 Phase 2 - Team: ${team.teamName} completed all questions correctly!`);

        res.json({ success: true, message: 'Phase 2 completed!' });
    } catch (error) {
        console.error('Phase 2 complete error:', error.message);
        res.status(500).json({ error: 'Server error' });
    }
});

// Submit Phase 2 answers
app.post('/api/phase2/submit', async (req, res) => {
    try {
        const { teamId, answers } = req.body;

        console.log(`Phase 2 submit request - TeamId: ${teamId}`);

        const team = await getTeamById(teamId);
        if (!team) {
            console.log('Team not found:', teamId);
            return res.status(404).json({ error: 'Team not found' });
        }

        if (team.phase2?.completed) {
            return res.status(400).json({ error: 'Phase 2 already completed' });
        }

        // Calculate score - only track which are correct/incorrect (no correct answers exposed)
        let score = 0;
        const results = phase2Questions.map((q, index) => {
            const isCorrect = answers[index] === q.correctAnswer;
            if (isCorrect) score++;
            return {
                questionIndex: index,
                isCorrect
            };
        });

        const passed = score === phase2Questions.length; // ALL must be correct

        const updateData = {
            phase2: {
                completed: passed
            }
        };

        if (passed) {
            updateData.currentPhase = 3;
        }

        await saveTeam(teamId, updateData);

        console.log(`📝 Phase 2 - Team: ${team.teamName}, Score: ${score}/${phase2Questions.length}, Passed: ${passed}`);

        res.json({
            success: true,
            score,
            total: phase2Questions.length,
            passed,
            results
        });
    } catch (error) {
        console.error('Phase 2 submit error:', error.message, error.stack);
        res.status(500).json({ error: 'Server error: ' + error.message });
    }
});

// Get Phase 3 questions
app.get('/api/phase3/questions', (req, res) => {
    const questionsWithoutAnswers = phase3Questions.map(q => ({
        id: q.id,
        code: q.code,
        question: q.question,
        options: q.options
    }));
    res.json(questionsWithoutAnswers);
});

// Submit Phase 3 answers
app.post('/api/phase3/submit', async (req, res) => {
    try {
        const { teamId, answers } = req.body;

        const team = await getTeamById(teamId);
        if (!team) {
            return res.status(404).json({ error: 'Team not found' });
        }

        if (team.currentPhase !== 3) {
            return res.status(400).json({ error: 'Not on Phase 3' });
        }

        if (team.phase3?.completed) {
            return res.status(400).json({ error: 'Phase 3 already completed' });
        }

        // Calculate score
        let score = 0;
        const results = phase3Questions.map((q, index) => {
            const isCorrect = answers[index] === q.correctAnswer;
            if (isCorrect) score++;
            return {
                questionId: q.id,
                userAnswer: answers[index],
                correctAnswer: q.correctAnswer,
                isCorrect
            };
        });

        const MIN_SCORE = 3;
        if (score < MIN_SCORE) {
            console.log(`💻 Phase 3 - Team: ${team.teamName}, Score: ${score}/5, Failed (min ${MIN_SCORE} required)`);
            return res.json({
                success: true,
                score,
                passed: false,
                results,
                questions: phase3Questions
            });
        }

        const updateData = {
            phase3: {
                completed: true
            },
            currentPhase: 4
        };

        await saveTeam(teamId, updateData);

        console.log(`💻 Phase 3 - Team: ${team.teamName}, Score: ${score}/5, Completed!`);

        res.json({
            success: true,
            score,
            passed: true,
            results,
            questions: phase3Questions
        });
    } catch (error) {
        console.error('Phase 3 submit error:', error.message);
        res.status(500).json({ error: 'Server error: ' + error.message });
    }
});

// Get Phase 4 code
app.get('/api/phase4/code', (req, res) => {
    res.json({ code: phase4Code });
});

// Submit Phase 4 answer
app.post('/api/phase4/submit', async (req, res) => {
    try {
        const { teamId, answer } = req.body;

        const team = await getTeamById(teamId);
        if (!team) {
            return res.status(404).json({ error: 'Team not found' });
        }

        if (team.currentPhase !== 4) {
            return res.status(400).json({ error: 'Not on Phase 4' });
        }

        if (team.phase4?.completed) {
            return res.status(400).json({ error: 'Phase 4 already completed' });
        }

        const correctAnswer = 'positive sum: 22, count: 4';
        const userAnswer = answer ? answer.trim().toLowerCase() : '';
        const isCorrect = userAnswer === correctAnswer || userAnswer === '22';

        if (isCorrect) {
            await saveTeam(teamId, {
                phase4: {
                    completed: true
                },
                currentPhase: 5
            });

            console.log(`🔓 Phase 4 - Team: ${team.teamName} solved the buggy code!`);

            return res.json({
                success: true,
                correct: true,
                message: 'Correct! The next treasure is at Room 2012!',
                room: '2012'
            });
        }

        res.json({
            success: false,
            correct: false,
            message: 'Incorrect output. Try again!'
        });
    } catch (error) {
        console.error('Phase 4 submit error:', error.message);
        res.status(500).json({ error: 'Server error: ' + error.message });
    }
});

// Get Phase 5 riddles
app.get('/api/phase5/riddles', (req, res) => {
    const riddlesWithoutAnswers = phase5Riddles.map(r => ({
        id: r.id,
        type: r.type,
        riddle: r.riddle,
        options: r.options
    }));
    res.json(riddlesWithoutAnswers);
});

// Submit single Phase 5 riddle answer
app.post('/api/phase5/answer', async (req, res) => {
    try {
        const { teamId, riddleId, answer } = req.body;

        const team = await getTeamById(teamId);
        if (!team) {
            return res.status(404).json({ error: 'Team not found' });
        }

        if (team.currentPhase !== 5) {
            return res.status(400).json({ error: 'Not on Phase 5' });
        }

        const riddle = phase5Riddles.find(r => r.id === riddleId);
        if (!riddle) {
            return res.status(400).json({ error: 'Invalid riddle' });
        }

        let isCorrect = false;
        if (riddle.type === 'mcq') {
            isCorrect = answer === riddle.correctAnswer;
        } else {
            isCorrect = riddle.acceptedAnswers.some(a => a.trim().toLowerCase() === answer.toString().toLowerCase().trim());
        }

        res.json({
            success: true,
            correct: isCorrect
        });
    } catch (error) {
        console.error('Phase 5 answer error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Submit Phase 5 completion
app.post('/api/phase5/complete', async (req, res) => {
    try {
        const { teamId, answers, score } = req.body;

        const team = await getTeamById(teamId);
        if (!team) {
            return res.status(404).json({ error: 'Team not found' });
        }

        if (team.currentPhase !== 5) {
            return res.status(400).json({ error: 'Not on Phase 5' });
        }

        // Recalculate score server-side for accuracy
        let serverScore = 0;
        const totalRiddles = phase5Riddles.length;
        if (answers && typeof answers === 'object') {
            Object.entries(answers).forEach(([riddleId, ans]) => {
                const riddle = phase5Riddles.find(r => r.id === parseInt(riddleId));
                if (riddle) {
                    if (riddle.type === 'mcq' && ans.answer === riddle.correctAnswer) {
                        serverScore++;
                    } else if (riddle.type === 'text' && typeof ans.answer === 'string' &&
                        riddle.acceptedAnswers.some(a => a.trim().toLowerCase() === ans.answer.trim().toLowerCase())) {
                        serverScore++;
                    }
                }
            });
        }

        // ALL challenges must be correct
        if (serverScore < totalRiddles) {
            console.log(`🧩 Phase 5 - Team: ${team.teamName} failed with ${serverScore}/${totalRiddles} (ALL required)`);
            return res.json({
                success: false,
                score: serverScore,
                total: totalRiddles,
                message: `You scored ${serverScore}/${totalRiddles}. All challenges must be correct to pass. Try again!`
            });
        }

        await saveTeam(teamId, {
            phase5: {
                completed: true
            },
            currentPhase: 6
        });

        console.log(`🧩 Phase 5 - Team: ${team.teamName} completed with ${serverScore}/${totalRiddles}!`);

        res.json({
            success: true,
            score: serverScore,
            message: 'Phase 5 completed! Proceed to the final phase.'
        });
    } catch (error) {
        console.error('Phase 5 complete error:', error.message);
        res.status(500).json({ error: 'Server error: ' + error.message });
    }
});

// Submit Phase 6 (Final)
app.post('/api/phase6/submit', upload.none(), async (req, res) => {
    try {
        const { teamId, locationAnswer } = req.body;

        const team = await getTeamById(teamId);
        if (!team) {
            return res.status(404).json({ error: 'Team not found' });
        }

        if (team.currentPhase !== 6) {
            return res.status(400).json({ error: 'Not on Phase 6' });
        }

        if (team.phase6?.completed) {
            return res.status(400).json({ error: 'Already completed' });
        }

        await saveTeam(teamId, {
            phase6: {
                locationAnswer: locationAnswer || '',
                completed: true
            },
            currentPhase: 7 // Completed
        });

        console.log(`🏆 COMPLETED - Team: ${team.teamName} | Location: ${locationAnswer || 'none'}`);

        res.json({
            success: true,
            message: 'Congratulations! You have completed CodeHunt-2026!',
            teamName: team.teamName,
            teamLeader: team.teamLeader
        });
    } catch (error) {
        console.error('Phase 6 submit error:', error.message);
        res.status(500).json({ error: 'Server error: ' + error.message });
    }
});

// Get leaderboard
app.get('/api/leaderboard', async (req, res) => {
    try {
        const teams = await getCompletedTeams();
        res.json(teams);
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Admin routes
app.get('/api/admin/teams', async (req, res) => {
    try {
        const teams = await getAllTeams();
        res.json(teams);
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/admin/stats', async (req, res) => {
    try {
        const stats = await getStats();
        res.json({
            totalTeams: stats.totalTeams,
            phaseStats: {
                phase1: stats.phase1,
                phase2: stats.phase2,
                phase3: stats.phase3,
                phase4: stats.phase4,
                phase5: stats.phase5,
                phase6: stats.phase6
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        database: useFirebase ? 'Firebase Firestore' : 'In-Memory',
        timestamp: new Date().toISOString()
    });
});

// Admin: Delete a specific team (for testing)
app.delete('/api/admin/teams/:teamId', async (req, res) => {
    try {
        const { teamId } = req.params;

        if (useFirebase) {
            await db.collection('teams').doc(teamId).delete();
        } else {
            teamsDB.delete(teamId);
        }

        console.log(`🗑️ Team deleted: ${teamId}`);
        res.json({ success: true, message: 'Team deleted' });
    } catch (error) {
        console.error('Delete team error:', error);
        res.status(500).json({ error: 'Failed to delete team' });
    }
});

// Admin: Clear all teams (for testing - BE CAREFUL!)
app.delete('/api/admin/clear-all', async (req, res) => {
    try {
        if (useFirebase) {
            const snapshot = await db.collection('teams').get();
            const batch = db.batch();
            snapshot.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
        } else {
            teamsDB.clear();
        }

        console.log('🗑️ All teams cleared!');
        res.json({ success: true, message: 'All teams cleared' });
    } catch (error) {
        console.error('Clear all error:', error);
        res.status(500).json({ error: 'Failed to clear teams' });
    }
});

// Serve frontend in production
const frontendPath = path.join(__dirname, '..', 'dist');
if (fs.existsSync(frontendPath)) {
    app.use(express.static(frontendPath));
    // SPA fallback - serve index.html for all non-API routes
    app.get('/{*path}', (req, res) => {
        if (!req.path.startsWith('/api')) {
            res.sendFile(path.join(frontendPath, 'index.html'));
        }
    });
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 CodeHunt-2026 Server running on port ${PORT}`);
    console.log(`📦 Database: ${useFirebase ? 'Firebase Firestore ✓' : 'In-Memory (add firebase-credentials.json for Firebase)'}`);
    if (!useFirebase) {
        console.log(`⚠️  Data will be lost when server restarts`);
    }
    console.log('');
});
