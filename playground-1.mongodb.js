/* eslint-disable no-undef */
/* global use, db */

// Select the database to use.
use('auto'); // Assuming 'auto' is the development database name, adjust if needed.

// --- User Management ---

// Upsert an admin user (update if exists, insert if not)
db.users.updateOne(
    { email: 'msveshnikov@gmail.com' },
    {
        $set: {
            email: 'msveshnikov@gmail.com', // Ensure email is set on insert
            isAdmin: true,
            subscriptionStatus: 'active', // Example: Give admin an active subscription
            role: 'admin',
            createdAt: new Date(),
            updatedAt: new Date()
        },
        $setOnInsert: {
            // Fields to set only when inserting a new document
            // Add password hashing if needed for direct insertion,
            // but typically user creation goes through the app logic.
            // password: 'hashed_password_placeholder',
            aiRequestCount: 0
        }
    },
    { upsert: true }
);

// Upsert a regular user (example)
db.users.updateOne(
    { email: 'testuser@example.com' },
    {
        $set: {
            email: 'testuser@example.com',
            isAdmin: false,
            subscriptionStatus: 'free', // Example: Default to free tier
            role: 'user',
            updatedAt: new Date()
        },
        $setOnInsert: {
            createdAt: new Date(),
            // password: 'hashed_password_placeholder',
            aiRequestCount: 0
        }
    },
    { upsert: true }
);

// --- Feedback ---

// Insert a sample feedback entry
// Find the admin user's ID to associate the feedback (optional)
const adminUser = db.users.findOne({ email: 'msveshnikov@gmail.com' });
if (adminUser) {
    db.feedbacks.insertOne({
        userId: adminUser._id,
        message: 'This is a sample feedback message from the playground script.',
        type: 'suggestion', // 'bug', 'suggestion', 'other'
        createdAt: new Date()
    });
} else {
    // Insert feedback without associating it to a specific user
    db.feedbacks.insertOne({
        userId: null, // Or a placeholder ObjectId if your schema requires it
        message: 'This is anonymous sample feedback.',
        type: 'general',
        createdAt: new Date()
    });
}

// --- Reports (Placeholder for future Report model) ---
/*
// Example: Insert a sample report if the 'reports' collection and schema exist
const regularUser = db.users.findOne({ email: 'testuser@example.com' });
if (regularUser) {
    db.reports.insertOne({
        userId: regularUser._id,
        url: 'https://example.com',
        analysisData: {
            title: 'Example Domain',
            description: 'Example Domain description check.',
            // ... other analysis fields
        },
        status: 'completed', // 'pending', 'processing', 'completed', 'failed'
        createdAt: new Date(),
        updatedAt: new Date()
    });
}
*/

// --- Index Creation (Optional - ensure indexes exist for common queries) ---
/*
db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ subscriptionId: 1 });
db.feedbacks.createIndex({ userId: 1 });
db.feedbacks.createIndex({ createdAt: -1 });
// db.reports.createIndex({ userId: 1 });
// db.reports.createIndex({ url: 1 });
// db.reports.createIndex({ createdAt: -1 });
*/

// --- Data Cleanup (Optional examples) ---
/*
// Remove feedback older than 90 days
// const ninetyDaysAgo = new Date();
// ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
// db.feedbacks.deleteMany({ createdAt: { $lt: ninetyDaysAgo } });

// Remove reports older than 1 year
// const oneYearAgo = new Date();
// oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
// db.reports.deleteMany({ createdAt: { $lt: oneYearAgo } });
*/

// --- Verification ---
print('Playground script execution finished.');
print(`Admin User ('msveshnikov@gmail.com') upserted.`);
print(`Regular User ('testuser@example.com') upserted.`);
print(`Sample feedback inserted.`);
// print('Indexes checked/created (if uncommented).');
// print('Data cleanup performed (if uncommented).');

const userCount = db.users.countDocuments();
const feedbackCount = db.feedbacks.countDocuments();
// const reportCount = db.reports.countDocuments(); // Uncomment if reports collection exists

print(`Total users: ${userCount}`);
print(`Total feedback entries: ${feedbackCount}`);
// print(`Total reports: ${reportCount}`); // Uncomment if reports collection exists