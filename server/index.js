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
import { getTextGemini } from './gemini.js';
import { getTextGrok } from './grok.js';
import { getTextGpt } from './openai.js';
import { getTextDeepseek } from './deepseek.js';
import User from './models/User.js';
// Removed Presentation model import
import Feedback from './models/Feedback.js';
// Removed imageService import
import userRoutes from './user.js';
import adminRoutes from './admin.js';
import searchRoutes from './search.js'; // Assuming search.js exports a router
import { authenticateToken, authenticateTokenOptional } from './middleware/auth.js';
// Removed enrichMetadata import from utils.js as it was presentation specific
import { getTextClaude } from './claude.js';
// Removed unused fetchSearchResults, searchWebContent from search.js import - assuming search.js handles its own logic internally or via its router

dotenv.config();

const stripe = process.env.STRIPE_KEY ? new Stripe(process.env.STRIPE_KEY) : null;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const app = express();

app.set('trust proxy', 1);
const port = process.env.PORT || 3000;

// Middleware for conditional JSON parsing (excluding Stripe webhook)
app.use((req, res, next) => {
    if (req.originalUrl === '/api/stripe-webhook') {
        next();
    } else {
        express.json({ limit: '15mb' })(req, res, next); // Keep generous limit for potential large POSTs? Review if needed.
    }
});

// Prometheus metrics middleware
const metricsMiddleware = promBundle({
    includeMethod: true,
    includePath: true,
    includeStatusCode: true,
    // TODO: Review if 'model' label is still relevant for SEO checks or needs changing
    customLabels: { model: 'No' },
    transformLabels: (labels, req) => {
        labels.model = req?.body?.model ?? 'No'; // Keep for now, might be used by AI suggestions
        return labels;
    }
});
app.use(metricsMiddleware);

// Standard middleware
app.use(cors());
app.use(express.static(join(__dirname, '../dist'))); // Serve static files from Vite build output
app.use(morgan('dev')); // Request logging
app.use(compression()); // Response compression

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 130 // limit each IP to 130 requests per windowMs
});

// Apply rate limiter to API routes in production
if (process.env.NODE_ENV === 'production') {
    app.use('/api/', limiter);
}

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI, {}).then(() => {
    console.log('MongoDB connected successfully.');
}).catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1); // Exit if DB connection fails
});

// --- Mount Routers ---
userRoutes(app); // User authentication and profile routes
adminRoutes(app); // Admin panel routes
searchRoutes(app); // SEO analysis routes

// --- AI Model Dispatcher ---
// TODO: Consider moving this to a dedicated AI service module if complexity grows
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
            case 'claude-3-7-sonnet-20250219':
                return await getTextClaude(prompt, model, temperature);
            case 'grok-2-latest':
            case 'grok-3-mini':
                return await getTextGrok(prompt, model, temperature);
            default:
                console.warn(`Invalid or unsupported AI model specified: ${model}`);
                // Fallback or throw error - decide based on desired behavior
                // Using a default/fallback model:
                // return await getTextGpt(prompt, 'gpt-4o-mini', temperature);
                throw new Error(`Invalid AI model specified: ${model}`);
        }
    } catch (error) {
        console.error(`Error generating AI response with model ${model}:`, error);
        throw error; // Re-throw the error to be handled by the caller
    }
};

// --- Utility Functions ---
// TODO: Move to utils.js
export const getIpFromRequest = (req) => {
    let ips = (
        req.headers['x-real-ip'] ||
        req.headers['x-forwarded-for'] ||
        req.connection.remoteAddress ||
        ''
    ).split(',');
    return ips[0].trim();
};

// --- Usage Limit Middleware ---
// TODO: Adapt this for SEO analysis limits instead of presentation limits
/*
export const checkUsageLimit = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(401).json({ error: 'User not found' });
        }

        // Example: Limit free users to 5 analyses per day
        const isPremium = user.subscriptionStatus === 'active' || user.subscriptionStatus === 'trialing';
        const limit = isPremium ? Infinity : 5; // Premium users have no limit, free users have 5

        if (!isPremium) {
            const now = new Date();
            const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

            if (user.lastAnalysisTime && user.lastAnalysisTime >= todayStart) {
                if (user.analysisCount >= limit) {
                    return res.status(429).json({ error: 'Daily analysis limit reached. Please upgrade for unlimited analyses.' });
                }
                user.analysisCount++;
            } else {
                // Reset count for the new day
                user.analysisCount = 1;
            }
            user.lastAnalysisTime = now; // Update last analysis time
            await user.save();
        }

        next(); // Proceed if limit not reached or user is premium
    } catch (err) {
        console.error('Error checking usage limit:', err);
        next(err); // Pass error to global error handler
    }
};
*/

// --- API Endpoints ---

// Feedback Endpoint
app.post('/api/feedback', authenticateTokenOptional, async (req, res) => {
    try {
        const { message, type } = req.body;
        if (!message || !type) {
            return res.status(400).json({ error: 'Message and type are required for feedback.' });
        }
        const feedback = new Feedback({
            userId: req?.user?.id, // Optional user ID
            message,
            type,
            createdAt: new Date()
        });
        await feedback.save();
        res.status(201).json(feedback);
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
            console.error(`⚠️ Webhook signature verification failed.`, err.message);
            return res.status(400).send(`Webhook Error: ${err.message}`);
        }

        console.log('✅ Stripe Webhook Success:', event.id, event.type);

        // Handle the event
        switch (event.type) {
            case 'customer.subscription.created':
            case 'customer.subscription.updated':
            case 'customer.subscription.deleted': {
                const subscription = event.data.object;
                try {
                    const customer = await stripe.customers.retrieve(subscription.customer);
                    if (customer.deleted) {
                        console.log(`Customer ${subscription.customer} is deleted. Skipping user update.`);
                        break;
                    }
                    const user = await User.findOneAndUpdate(
                        { email: customer.email },
                        {
                            subscriptionStatus: subscription.status,
                            subscriptionId: subscription.id,
                            stripeCustomerId: customer.id // Store Stripe customer ID
                        },
                        { new: true } // Return the updated document
                    );
                    if (!user) {
                        console.error(`User not found for email ${customer.email} during webhook processing.`);
                    } else {
                        console.log(`Updated user ${user.email} subscription status to ${subscription.status}`);
                        // Optional: Send Google Analytics event (ensure GA_API_SECRET and measurement_id are set)
                        /*
                        const measurement_id = process.env.GA_MEASUREMENT_ID;
                        const api_secret = process.env.GA_API_SECRET;
                        if (measurement_id && api_secret) {
                            fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${measurement_id}&api_secret=${api_secret}`, {
                                method: 'POST',
                                body: JSON.stringify({
                                    client_id: user._id.toString(), // Use user ID as client_id if appropriate
                                    user_id: user._id.toString(),
                                    events: [{
                                        name: 'subscription_update', // More specific event name
                                        params: {
                                            subscription_status: subscription.status,
                                            plan_id: subscription.items?.data[0]?.price?.id, // Example: get plan ID
                                            // Add other relevant parameters
                                        },
                                    }],
                                })
                            }).catch(err => console.error('Error sending GA event:', err));
                        }
                        */
                    }
                } catch (err) {
                    console.error(`Error processing subscription webhook for customer ${subscription.customer}:`, err);
                }
                break;
            }
            // TODO: Handle other relevant events like 'invoice.payment_succeeded', 'invoice.payment_failed'
            default:
                console.log(`Unhandled Stripe event type ${event.type}`);
        }

        // Return a 200 response to acknowledge receipt of the event
        res.json({ received: true });
    });
} else {
    console.warn('Stripe key or webhook secret not configured. Stripe integration disabled.');
}

// Docs Endpoint (Reads markdown files from ../docs)
app.get('/api/docs', async (req, res) => {
    try {
        const search = req.query.search ? req.query.search.toLowerCase() : '';
        const categoryQuery =
            req.query.category && req.query.category !== 'all'
                ? req.query.category.toLowerCase()
                : null;

        const docsPath = join(__dirname, '../docs'); // Assuming docs are in ../docs relative to server/index.js
        let filenames = [];
        try {
            filenames = await fsPromises.readdir(docsPath);
        } catch (err) {
            if (err.code === 'ENOENT') {
                console.warn('Docs directory not found at:', docsPath);
                return res.json([]); // Return empty array if docs dir doesn't exist
            }
            throw err; // Re-throw other errors
        }

        const docsData = await Promise.all(
            filenames
                .filter(filename => filename.endsWith('.md')) // Process only markdown files
                .map(async (filename) => {
                    const filePath = join(docsPath, filename);
                    const content = await fsPromises.readFile(filePath, 'utf8');
                    // Basic title extraction from filename (improve if needed)
                    const title = filename.replace(/\.md$/, '').replace(/[_-]+/g, ' ');
                    // TODO: Implement category extraction if needed (e.g., from frontmatter or subdirectories)
                    const category = 'general';
                    return { title, category, content, filename };
                })
        );

        let filteredDocs = docsData;

        // Apply filters
        if (categoryQuery) {
            filteredDocs = filteredDocs.filter(
                (doc) =>
                    doc.category.toLowerCase().includes(categoryQuery) ||
                    doc.filename.toLowerCase().includes(categoryQuery) // Allow filtering by filename too
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
        // const reports = await Report.find({ isPublic: true }).select('slug createdAt');

        const baseUrl = 'https://seocheck.my'; // Update base URL
        const staticRoutes = [
            '/', // Assumes Landing.jsx is at root
            '/docs',
            '/privacy',
            '/terms',
            '/login',
            '/signup',
            '/forgot',
            // Add other static pages served by the React app
            '/profile',
            '/feedback',
            '/admin' // Consider if admin should be in sitemap
        ];

        let urlsXml = staticRoutes
            .map((route) => `<url><loc>${baseUrl}${route}</loc></url>`)
            .join('');

        // TODO: Add dynamic report URLs if applicable
        // reports.forEach((report) => {
        //     urlsXml += `<url><loc>${baseUrl}/report/${report.slug}</loc><lastmod>${report.createdAt.toISOString()}</lastmod></url>`;
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
// Serve index.html for all other GET requests (React Router handles client-side routing)
app.get('*', (req, res, next) => {
    // Avoid serving index.html for API routes or specific files like sitemap.xml
    if (req.path.startsWith('/api/') || req.path.endsWith('.xml') || req.path.endsWith('.txt') || req.path.includes('.')) {
       return next();
    }
    try {
        const htmlPath = join(__dirname, '../dist/index.html');
        // Check if file exists before sending
        if (fs.existsSync(htmlPath)) {
            res.sendFile(htmlPath);
        } else {
            // Handle case where index.html doesn't exist (e.g., build not run)
            console.error('index.html not found in dist folder:', htmlPath);
            res.status(500).send('Application not built correctly.');
        }
    } catch (error) {
        console.error('Error serving index.html:', error);
        next(error); // Pass error to global handler
    }
});


// --- Error Handling ---
// 404 Handler (if no other route matched)
app.use((req, res) => {
    res.status(404).json({ error: 'Not Found' });
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error('Global Error Handler:', err);
    // TODO: Add more sophisticated error handling (e.g., distinguish client vs server errors)
    res.status(err.status || 500).json({
        error: err.message || 'Internal Server Error'
    });
});

// Uncaught Exception Handler
process.on('uncaughtException', (err, origin) => {
    console.error(`UNCAUGHT EXCEPTION: ${err.stack || err}`, `Exception origin: ${origin}`);
    // Consider gracefully shutting down the server here in production
    // process.exit(1);
});

// Unhandled Rejection Handler
process.on('unhandledRejection', (reason, promise) => {
    console.error('UNHANDLED REJECTION at:', promise, 'reason:', reason);
    // Consider gracefully shutting down the server here in production
    // process.exit(1);
});

// --- Start Server ---
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

// Set Google Credentials Path (if needed for VertexAI/Gemini)
// Ensure the path is correct relative to where the server is started
if (process.env.GOOGLE_APPLICATION_CREDENTIALS_PATH) {
    process.env['GOOGLE_APPLICATION_CREDENTIALS'] = process.env.GOOGLE_APPLICATION_CREDENTIALS_PATH;
    console.log(`Using Google Application Credentials from: ${process.env.GOOGLE_APPLICATION_CREDENTIALS}`);
} else {
    // Default path if not set via environment variable, adjust as needed
    const defaultGoogleCredsPath = join(__dirname, 'google.json');
    if (fs.existsSync(defaultGoogleCredsPath)) {
         process.env['GOOGLE_APPLICATION_CREDENTIALS'] = defaultGoogleCredsPath;
         console.log(`Using default Google Application Credentials from: ${defaultGoogleCredsPath}`);
    } else {
        console.warn('Google Application Credentials path not set (GOOGLE_APPLICATION_CREDENTIALS_PATH) and default google.json not found. Google Cloud services might not work.');
    }
}