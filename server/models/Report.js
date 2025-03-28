import mongoose from 'mongoose';

// Sub-schema for Open Graph data
const openGraphSchema = new mongoose.Schema(
    {
        title: String,
        description: String,
        image: String,
        url: String,
        type: String
    },
    { _id: false }
);

// Sub-schema for Twitter Card data
const twitterCardSchema = new mongoose.Schema(
    {
        card: String,
        title: String,
        description: String,
        image: String
    },
    { _id: false }
);

// Sub-schema for Meta Tags
const metaTagsSchema = new mongoose.Schema(
    {
        title: { value: String, length: Number },
        description: { value: String, length: Number },
        keywords: { value: String }, // Note: Keywords meta tag has little SEO value now
        charset: { value: String },
        viewport: { value: String },
        canonical: { value: String },
        openGraph: openGraphSchema, // Use the explicit sub-schema
        twitterCard: twitterCardSchema // Use the explicit sub-schema
    },
    { _id: false }
);

// Sub-schema for the detailed analysis checks
const reportCheckSchema = new mongoose.Schema(
    {
        https: {
            usesHttps: Boolean,
            finalUrl: String, // The URL after potential redirect to HTTPS
            certificateValid: { type: Boolean, default: null }, // Placeholder for future check
            error: String
        },
        robotsTxt: {
            exists: Boolean,
            url: String, // URL where robots.txt was found (or expected)
            content: { type: String, maxLength: 20000 }, // Increased limit slightly
            isValid: { type: Boolean, default: null }, // Placeholder for validation result
            allowsCrawling: { type: Boolean, default: null }, // Specific check for common crawlers
            validationErrors: [String],
            error: String
        },
        sitemap: {
            exists: Boolean,
            url: String, // URL found (e.g., from robots.txt or common paths)
            isValid: { type: Boolean, default: null }, // Placeholder for validation result
            validationErrors: [String],
            error: String
        },
        metaTags: metaTagsSchema, // Use the explicit meta tags schema
        headings: {
            // Using Mixed type for flexibility { h1: ['Text'], h2: ['Text'], ... }
            tags: mongoose.Schema.Types.Mixed,
            h1Count: Number,
            totalHeadings: Number
        },
        images: {
            count: Number,
            missingAltCount: Number,
            oversizedCount: { type: Number, default: 0 }, // Placeholder
            usesModernFormats: { type: Boolean, default: null } // Placeholder (e.g., WebP/AVIF)
            // Optionally store a sample or limited list of images if needed
            // sampleImages: [{ src: String, alt: String, size: Number, format: String }]
        },
        content: {
            wordCount: Number,
            contentLength: Number, // Often same as wordCount, but could be char count
            readabilityScore: { type: Number, default: null }, // Placeholder (e.g., Flesch-Kincaid)
            keywordDensity: mongoose.Schema.Types.Mixed, // Placeholder { keyword: density, ... }
            duplicateContentScore: { type: Number, default: null } // Placeholder (e.g., internal similarity)
        },
        mobileFriendly: {
            // Based on viewport meta tag primarily for now
            hasViewportMeta: Boolean,
            viewportContent: String
            // Could add results from Google Mobile-Friendly Test API later
        },
        schemaMarkup: {
            hasSchema: Boolean,
            count: Number,
            detectedTypes: [String] // Store detected schema types (e.g., "Article", "Product")
            // Storing full schema data might be large; consider storing flags or summaries
        },
        performance: {
            // Placeholder for future PageSpeed Insights / Core Web Vitals data
            analysisTool: { type: String, default: 'pending_integration' }, // e.g., 'PageSpeed API'
            lcp: { type: Number, default: null }, // Largest Contentful Paint (seconds)
            fid: { type: Number, default: null }, // First Input Delay (milliseconds) - Note: Being replaced by INP
            cls: { type: Number, default: null }, // Cumulative Layout Shift
            fcp: { type: Number, default: null }, // First Contentful Paint (seconds)
            ttfb: { type: Number, default: null }, // Time to First Byte (seconds)
            speedIndex: { type: Number, default: null },
            status: String // e.g., 'good', 'needs_improvement', 'poor' based on metrics
        },
        technicalSeo: {
            hasHreflang: Boolean,
            hreflangTags: [String] // Store the actual hreflang tag values found
            // Add other technical checks here as needed
        },
        linkAnalysis: {
            // Basic internal/external link counts
            internalLinksCount: Number,
            externalLinksCount: Number,
            brokenInternalLinksCount: { type: Number, default: null }, // Placeholder
            brokenExternalLinksCount: { type: Number, default: null } // Placeholder
            // More advanced checks might require full site crawl
        }
    },
    { _id: false } // Prevent Mongoose from creating _id for this subdocument
);

const reportSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User', // Links this report to a User document
            required: true,
            index: true // Index for efficient querying by user
        },
        url: {
            type: String,
            required: [true, 'Original URL is required for the report'],
            trim: true
        },
        finalUrl: {
            // The URL after following any redirects
            type: String,
            trim: true
        },
        fetchStatus: {
            // HTTP status code returned when fetching the final URL
            type: Number
        },
        analysisStatus: {
            // Tracks the state of the analysis process (especially if async)
            type: String,
            enum: ['pending', 'processing', 'completed', 'failed'],
            default: 'pending',
            index: true
        },
        analysisTimeMs: {
            // Time taken for the analysis in milliseconds
            type: Number
        },
        overallScore: {
            // A calculated SEO score (e.g., 0-100), potentially added after analysis
            type: Number,
            min: 0,
            max: 100
        },
        checks: reportCheckSchema, // Embed the detailed analysis checks
        aiSuggestions: {
            // Stores AI-generated recommendations or summaries, potentially structured
            // Example structure (flexible with Mixed):
            // { metaTitle: "...", metaDescription: "...", contentImprovements: "...", technicalFixes: "..." }
            type: mongoose.Schema.Types.Mixed
        },
        errorMessage: {
            // Stores error message if analysisStatus is 'failed' or fetch failed
            type: String
        }
        // Optional: Add projectId if implementing project-based organization
        // projectId: {
        //     type: mongoose.Schema.Types.ObjectId,
        //     ref: 'Project',
        //     index: true
        // }
    },
    {
        timestamps: true // Automatically manage createdAt and updatedAt fields
    }
);

// Index for efficiently fetching recent reports for a user (used in Dashboard/Profile)
reportSchema.index({ userId: 1, createdAt: -1 });

// Optional: Index for searching reports by final URL (if needed, e.g., for uniqueness checks or lookups)
reportSchema.index({ finalUrl: 1 });

// Optional: Compound index if frequently querying by user and status
reportSchema.index({ userId: 1, analysisStatus: 1 });

const Report = mongoose.model('Report', reportSchema);

export default Report;