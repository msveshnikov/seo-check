import express from 'express';
import cors from 'cors';
import fs from 'fs';
import promBundle from 'express-prom-bundle';
import { promises as fsPromises } from 'fs';
import dotenv from 'dotenv';
import Stripe from 'stripe';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import morgan from 'morgan';
import compression from 'compression';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// AI Service Imports
import { getTextGemini } from './gemini.js';
import { getTextGrok } from './grok.js';
import { getTextGpt } from './openai.js';
import { getTextDeepseek } from './deepseek.js';
import { getTextClaude } from './claude.js';

// Models
import User from './models/User.js';
import Feedback from './models/Feedback.js';
// Potential future model: import Report from './models/Report.js';

// Routes
import userRoutes from './user.js';
import adminRoutes from './admin.js';
import searchRoutes from './search.js';

// Middleware
import { authenticateTokenOptional } from './middleware/auth.js';

// Utilities (Example: Assuming getIpFromRequest moved to utils.js)
// import { getIpFromRequest } from './utils.js';

dotenv.config();

const stripe = process.env.STRIPE_KEY ? new Stripe(process.env.STRIPE_KEY) : null;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const app = express();

app.set('trust proxy', 1); // Trust first proxy for IP address determination
const port = process.env.PORT || 3000;

// --- Core Middleware ---

// Middleware for conditional JSON parsing (excluding Stripe webhook)
app.use((req, res, next) => {
    if (req.originalUrl === '/api/stripe-webhook') {
        next(); // Pass raw body for Stripe signature verification
    } else {
        express.json({ limit: '15mb' })(req, res, next); // Adjust limit as needed
    }
});

// Standard middleware
app.use(cors()); // Enable Cross-Origin Resource Sharing
app.use(express.static(join(__dirname, '../dist'))); // Serve static files from Vite build output
app.use(morgan('dev')); // HTTP request logger
app.use(compression()); // Compress responses

// --- Rate Limiting ---
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 130, // Limit each IP to 130 requests per windowMs
    message: 'Too many requests from this IP, please try again after 15 minutes'
});

// Apply rate limiter to API routes in production
if (process.env.NODE_ENV === 'production') {
    app.use('/api/', apiLimiter);
    console.log('Rate limiting applied to /api/ routes.');
}

// --- Database Connection ---
mongoose
    .connect(process.env.MONGODB_URI, {})
    .then(() => {
        console.log('MongoDB connected successfully.');
    })
    .catch((err) => {
        console.error('MongoDB connection error:', err);
        process.exit(1); // Exit if DB connection fails
    });

// --- AI Model Dispatcher ---
// TODO: Consider moving this to a dedicated AI service module (e.g., server/aiService.js)
const generateAIResponse = async (prompt, model, temperature = 0.7) => {
    try {
        switch (model) {
            case 'o3-mini':
            case 'gpt-4o-mini':
                return await getTextGpt(prompt, model, temperature);
            case 'gemini-2.0-pro-exp-02-05':
            case 'gemini-2.0-flash-001':
            case 'gemini-2.0-flash-thinking-exp-01-21':
                return await getTextGemini(prompt, model, temperature);
            case 'deepseek-reasoner':
                return await getTextDeepseek(prompt, model, temperature);
            case 'claude-3-7-sonnet-20250219': // Example Claude model name, adjust if needed
            case 'claude-3-opus-20240229':
            case 'claude-3-sonnet-20240229':
            case 'claude-3-haiku-20240307':
                return await getTextClaude(prompt, model, temperature);
            case 'grok-2-latest':
            case 'grok-3-mini':
                return await getTextGrok(prompt, model, temperature);
            default:
                console.warn(
                    `Invalid or unsupported AI model specified: ${model}. Falling back to default.`
                );
                // Fallback to a default model (e.g., gpt-4o-mini)
                return await getTextGpt(prompt, 'gpt-4o-mini', temperature);
            // OR throw an error:
            // throw new Error(`Invalid AI model specified: ${model}`);
        }
    } catch (error) {
        console.error(`Error generating AI response with model ${model}:`, error);
        throw error; // Re-throw the error to be handled by the caller
    }
};
// Make dispatcher available globally or pass to routes if needed
app.locals.generateAIResponse = generateAIResponse;

// --- Usage Limit Middleware Placeholder ---
// TODO: Adapt this for SEO analysis limits and apply to relevant routes (e.g., within search.js)
/*
export const checkUsageLimit = async (req, res, next) => {
    if (!req.user) { // Only apply to logged-in users
        return next(); // Skip for anonymous users (or apply different limits)
    }
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(401).json({ error: 'User not found' });
        }

        // Example: Limit free users to 5 analyses per 24 hours
        const isPremium = user.subscriptionStatus === 'active' || user.subscriptionStatus === 'trialing';
        const limit = isPremium ? Infinity : 5; // Premium: unlimited, Free: 5
        const periodMs = 24 * 60 * 60 * 1000; // 24 hours

        const now = Date.now();
        const usageWindowStart = now - periodMs;

        // Filter usage records within the current window
        user.analysisUsage = user.analysisUsage.filter(timestamp => timestamp > usageWindowStart);

        if (!isPremium && user.analysisUsage.length >= limit) {
            const nextAvailableTime = new Date(user.analysisUsage[0] + periodMs);
            return res.status(429).json({
                error: `Daily analysis limit (${limit}) reached. Please upgrade or try again after ${nextAvailableTime.toLocaleString()}.`
            });
        }

        // Record usage (only if limit check passes or user is premium)
        user.analysisUsage.push(now);
        await user.save();

        next(); // Proceed if limit not reached or user is premium
    } catch (err) {
        console.error('Error checking usage limit:', err);
        next(err); // Pass error to global error handler
    }
};
*/

// --- Mount Routers ---
userRoutes(app); // Handles /api/user/*
adminRoutes(app); // Handles /api/admin/*
// searchRoutes(app); // Handles /api/search/*

// --- Specific API Endpoints ---

// Feedback Endpoint
app.post('/api/feedback', authenticateTokenOptional, async (req, res) => {
    try {
        const { message, type, context } = req.body; // Added context (optional)
        if (!message || !type) {
            return res.status(400).json({ error: 'Message and type are required for feedback.' });
        }
        const feedback = new Feedback({
            userId: req?.user?.id, // Optional: links feedback to logged-in user
            message,
            type,
            context, // Store additional context like current page or feature
            ipAddress: req.ip, // Store IP address
            userAgent: req.headers['user-agent'], // Store User Agent
            createdAt: new Date()
        });
        await feedback.save();
        res.status(201).json({
            message: 'Feedback received successfully.',
            feedbackId: feedback._id
        });
    } catch (error) {
        console.error('Error saving feedback:', error);
        res.status(500).json({ error: 'Failed to save feedback.' });
    }
});

// Stripe Webhook Endpoint
if (stripe && process.env.STRIPE_WH_SECRET) {
    app.post('/api/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
        const sig = req.headers['stripe-signature'];
        let event;

        try {
            event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WH_SECRET);
        } catch (err) {
            console.error(`⚠️ Stripe Webhook signature verification failed.`, err.message);
            return res.status(400).send(`Webhook Error: ${err.message}`);
        }

        console.log('✅ Stripe Webhook Received:', event.id, event.type);

        // Handle the event
        switch (event.type) {
            case 'customer.subscription.created':
            case 'customer.subscription.updated':
            case 'customer.subscription.deleted': {
                const subscription = event.data.object;
                try {
                    // Retrieve customer only if needed (e.g., to get email if not in metadata)
                    // Ensure customer email is reliably associated with your User model
                    let userEmail;
                    if (subscription.metadata && subscription.metadata.userEmail) {
                        userEmail = subscription.metadata.userEmail;
                    } else {
                        const customer = await stripe.customers.retrieve(subscription.customer);
                        if (customer.deleted) {
                            console.log(
                                `Customer ${subscription.customer} is deleted. Skipping user update.`
                            );
                            break;
                        }
                        userEmail = customer.email;
                    }

                    if (!userEmail) {
                        console.error(
                            `Could not determine user email for subscription ${subscription.id}. Customer: ${subscription.customer}`
                        );
                        break;
                    }

                    const user = await User.findOneAndUpdate(
                        { email: userEmail },
                        {
                            subscriptionStatus: subscription.status,
                            subscriptionId: subscription.id,
                            stripeCustomerId: subscription.customer, // Ensure this is stored
                            planId: subscription.items?.data[0]?.price?.id // Store current plan ID
                        },
                        { new: true, upsert: false } // Don't create user here, should exist
                    );
                    if (!user) {
                        console.error(
                            `User not found for email ${userEmail} during webhook processing for subscription ${subscription.id}.`
                        );
                    } else {
                        console.log(
                            `Updated user ${user.email} subscription status to ${subscription.status}, Plan: ${subscription.items?.data[0]?.price?.id}`
                        );
                        // Optional: Trigger other actions like sending confirmation email, updating analytics
                    }
                } catch (err) {
                    console.error(
                        `Error processing subscription webhook ${event.id} (Type: ${event.type}) for customer ${subscription.customer}:`,
                        err
                    );
                    // Respond with 500 to signal Stripe to retry (if appropriate)
                    // return res.status(500).send('Internal server error processing webhook.');
                }
                break;
            }
            case 'invoice.payment_succeeded': {
                const invoice = event.data.object;
                // Common scenario: Subscription payment succeeded
                if (invoice.subscription) {
                    // Potentially update user record, e.g., grant access period, log payment
                    console.log(`Payment succeeded for subscription ${invoice.subscription}`);
                    // Find user by subscriptionId or customerId and update accordingly
                }
                break;
            }
            case 'invoice.payment_failed': {
                const invoice = event.data.object;
                // Handle failed payment, e.g., notify user, update subscription status via `customer.subscription.updated` event
                console.log(
                    `Payment failed for invoice ${invoice.id}, subscription ${invoice.subscription}`
                );
                // User status likely updated via `customer.subscription.updated` to 'past_due' or 'canceled'
                break;
            }
            // Add other relevant event types as needed
            default:
                console.log(`Unhandled Stripe event type ${event.type}`);
        }

        // Return a 200 response to acknowledge receipt of the event
        res.json({ received: true });
    });
} else {
    console.warn(
        'Stripe key (STRIPE_KEY) or webhook secret (STRIPE_WH_SECRET) not configured. Stripe integration disabled.'
    );
}

// Docs Endpoint (Reads markdown files from ../docs) - Ensure '../docs' exists or handle error
app.get('/api/docs', async (req, res) => {
    try {
        const search = req.query.search ? req.query.search.toLowerCase() : '';
        const categoryQuery =
            req.query.category && req.query.category !== 'all'
                ? req.query.category.toLowerCase()
                : null;

        const docsPath = join(__dirname, '../docs'); // Path relative to server/index.js
        let filenames = [];
        try {
            filenames = await fsPromises.readdir(docsPath);
        } catch (err) {
            if (err.code === 'ENOENT') {
                console.warn('Documentation directory not found at:', docsPath);
                return res.json([]); // Return empty array if docs dir doesn't exist
            }
            console.error('Error reading docs directory:', err);
            throw err; // Re-throw other errors
        }

        const docsDataPromises = filenames
            .filter((filename) => filename.endsWith('.md'))
            .map(async (filename) => {
                try {
                    const filePath = join(docsPath, filename);
                    const content = await fsPromises.readFile(filePath, 'utf8');
                    // Basic title extraction from filename (can be improved, e.g., reading frontmatter)
                    const title = filename
                        .replace(/\.md$/, '')
                        .replace(/[_-]+/g, ' ')
                        // Simple title case
                        .replace(/\b\w/g, (char) => char.toUpperCase());

                    // TODO: Implement category extraction (e.g., from frontmatter, subdirectories)
                    const category = 'General'; // Default category

                    return { title, category, content, filename };
                } catch (fileError) {
                    console.error(`Error processing doc file ${filename}:`, fileError);
                    return null; // Skip files that cause errors
                }
            });

        const docsData = (await Promise.all(docsDataPromises)).filter((doc) => doc !== null);

        let filteredDocs = docsData;

        // Apply filters
        if (categoryQuery) {
            filteredDocs = filteredDocs.filter(
                (doc) =>
                    doc.category.toLowerCase() === categoryQuery || // Exact match category
                    doc.filename.toLowerCase().includes(categoryQuery) // Allow filtering by filename part
            );
        }
        if (search) {
            filteredDocs = filteredDocs.filter(
                (doc) =>
                    doc.title.toLowerCase().includes(search) ||
                    doc.content.toLowerCase().includes(search)
            );
        }

        res.json(filteredDocs);
    } catch (e) {
        console.error('Error fetching docs:', e);
        res.status(500).json({ error: 'Failed to retrieve documentation.' });
    }
});

// Sitemap Endpoint
app.get('/sitemap.xml', async (req, res) => {
    try {
        // TODO: Fetch dynamic URLs if SEO reports have public pages
        // const reports = await Report.find({ isPublic: true }).select('slug createdAt updatedAt'); // Example

        const baseUrl = process.env.BASE_URL || 'https://seocheck.my'; // Use env variable or default
        const staticRoutes = [
            '/',
            '/docs',
            '/privacy',
            '/terms',
            '/login',
            '/signup',
            '/forgot',
            // Add other static client-side routes served by React Router
            '/profile', // Assuming '/profile' is a route
            '/feedback' // Assuming '/feedback' is a route
            // '/admin' // Usually excluded from public sitemaps
        ];

        let urlsXml = staticRoutes
            .map(
                (route) =>
                    `<url><loc>${baseUrl}${route}</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>`
            ) // Added changefreq/priority
            .join('');

        // TODO: Add dynamic report URLs if applicable
        // reports.forEach((report) => {
        //     const lastMod = report.updatedAt || report.createdAt;
        //     urlsXml += `<url><loc>${baseUrl}/report/${report.slug}</loc><lastmod>${lastMod.toISOString().split('T')[0]}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>`;
        // });

        const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlsXml}
</urlset>`;

        res.header('Content-Type', 'application/xml');
        res.send(sitemap);
    } catch (err) {
        console.error('Error generating sitemap:', err);
        res.status(500).send('Error generating sitemap');
    }
});

// --- Serve Frontend ---
// This should be the LAST route handler (except for error handlers)
app.get('*', (req, res, next) => {
    // Avoid serving index.html for API routes or specific known file types
    if (
        req.path.startsWith('/api/') ||
        req.path.endsWith('.xml') ||
        req.path.endsWith('.txt') ||
        req.path.includes('.') // Basic check for file extensions
    ) {
        return next(); // Pass to 404 handler if not an API route handled above
    }

    try {
        const htmlPath = join(__dirname, '../dist/index.html');
        // Check if file exists before sending - crucial for deployments
        if (fs.existsSync(htmlPath)) {
            res.sendFile(htmlPath);
        } else {
            console.error('Frontend entry point (index.html) not found at:', htmlPath);
            // Send a more user-friendly message or a specific status page
            res.status(500).send('Application is currently unavailable. Please try again later.');
        }
    } catch (error) {
        console.error('Error serving frontend entry point:', error);
        next(error); // Pass error to the global error handler
    }
});

// --- Error Handling ---
// 404 Handler (if no other route matched)
app.use((req, res) => {
    res.status(404).json({ error: 'Not Found', path: req.originalUrl });
});

// Global Error Handler (must have 4 arguments: err, req, res, next)
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    console.error('Global Error Handler caught:', err.stack || err);

    // Default to 500 Internal Server Error
    const statusCode = err.status || err.statusCode || 500;
    const message = err.message || 'Internal Server Error';

    // Avoid sending stack traces in production
    const responseError =
        process.env.NODE_ENV === 'production'
            ? { error: message }
            : { error: message, stack: err.stack };

    res.status(statusCode).json(responseError);
});

// --- Process Event Handlers for Graceful Shutdown and Error Logging ---
process.on('uncaughtException', (err, origin) => {
    console.error(`UNCAUGHT EXCEPTION: ${err.stack || err}`, `\nException origin: ${origin}`);
    // In production, consider a more robust logging mechanism and potentially a graceful shutdown
    // process.exit(1); // Forcing exit might lose context, use cautiously
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('UNHANDLED REJECTION at:', promise, 'reason:', reason);
    // Log the rejection reason, potentially exit in critical scenarios
    // process.exit(1);
});

// Optional: Graceful shutdown on SIGTERM/SIGINT
const signals = ['SIGINT', 'SIGTERM'];
signals.forEach((signal) => {
    process.on(signal, () => {
        console.log(`\nReceived ${signal}. Shutting down gracefully...`);
        // Close server, database connections, etc.
        mongoose.connection.close(() => {
            console.log('MongoDB connection closed.');
            process.exit(0);
        });
        // Add timeout for forceful shutdown if graceful fails
        setTimeout(() => {
            console.error('Could not close connections in time, forcefully shutting down');
            process.exit(1);
        }, 10000); // 10 seconds timeout
    });
});

// --- Google Credentials Setup ---
// Set Google Credentials Path (if needed for VertexAI/Gemini)
const setGoogleCredentials = () => {
    const envPath = process.env.GOOGLE_APPLICATION_CREDENTIALS_PATH;
    if (envPath) {
        const absolutePath = join(__dirname, envPath); // Assume path is relative to server dir if not absolute
        if (fs.existsSync(absolutePath)) {
            process.env['GOOGLE_APPLICATION_CREDENTIALS'] = absolutePath;
            console.log(`Using Google Application Credentials from env var: ${absolutePath}`);
            return;
        } else {
            console.warn(
                `Google credentials file specified in GOOGLE_APPLICATION_CREDENTIALS_PATH not found: ${absolutePath}`
            );
        }
    }

    // Default path if not set via environment variable
    const defaultGoogleCredsPath = join(__dirname, 'google.json');
    if (fs.existsSync(defaultGoogleCredsPath)) {
        process.env['GOOGLE_APPLICATION_CREDENTIALS'] = defaultGoogleCredsPath;
        console.log(`Using default Google Application Credentials from: ${defaultGoogleCredsPath}`);
    } else {
        console.warn(
            'Google Application Credentials path not set (GOOGLE_APPLICATION_CREDENTIALS_PATH) and default google.json not found in server directory. Google Cloud services might not work.'
        );
    }
};

setGoogleCredentials();

// --- Start Server ---
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
