import { load } from 'cheerio';
import { Router } from 'express';
import fetch from 'node-fetch'; // Assuming node-fetch or using built-in fetch if Node >= 18
import { authenticateToken } from './middleware/auth.js';
// Placeholder for Report model - assuming it will be created in models/Report.js
// import Report from './models/Report.js';

// --- Constants ---

const FETCH_TIMEOUT = 15000; // 15 seconds
const MAX_CONTENT_SIZE = 5 * 1024 * 1024; // 5 MB limit for fetched content

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36',
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 13_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.1 Mobile/15E148 Safari/604.1'
];

const router = Router();

// --- Helper Functions ---

const getRandomUserAgent = () => {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
};

/**
 * Fetches and parses the HTML content of a given URL.
 * @param {string} url - The URL to fetch.
 * @returns {Promise<{html: string, $: cheerio.CheerioAPI, finalUrl: string, status: number, error?: string }>} - Parsed content or error.
 */
const fetchAndParseUrl = async (url) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
    let response;

    try {
        response = await fetch(url, {
            headers: { 'User-Agent': getRandomUserAgent(), Accept: 'text/html,*/*' },
            signal: controller.signal,
            redirect: 'follow', // Follow redirects
            size: MAX_CONTENT_SIZE // Limit response size (if supported by fetch implementation)
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            return { error: `HTTP error! Status: ${response.status}`, status: response.status };
        }

        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('text/html')) {
            return {
                error: `Invalid content type: ${contentType || 'Not specified'}`,
                status: response.status
            };
        }

        // Check content length if available and enforce limit
        const contentLength = response.headers.get('content-length');
        if (contentLength && parseInt(contentLength, 10) > MAX_CONTENT_SIZE) {
            return {
                error: `Content exceeds size limit of ${MAX_CONTENT_SIZE} bytes`,
                status: 413
            }; // Payload Too Large
        }

        const html = await response.text();
        // Check actual size again after fetching
        if (Buffer.byteLength(html, 'utf8') > MAX_CONTENT_SIZE) {
            return {
                error: `Content exceeds size limit of ${MAX_CONTENT_SIZE} bytes`,
                status: 413
            };
        }

        const $ = load(html);
        return { html, $, finalUrl: response.url, status: response.status };
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            return {
                error: `Request timed out after ${FETCH_TIMEOUT / 1000} seconds`,
                status: 408
            }; // Request Timeout
        }
        if (error.type === 'max-size') {
            // Example for node-fetch size limit
            return {
                error: `Content exceeds size limit of ${MAX_CONTENT_SIZE} bytes`,
                status: 413
            };
        }
        console.error(`Fetch error for ${url}:`, error);
        return { error: `Failed to fetch URL: ${error.message}`, status: 500 }; // Internal Server Error or appropriate status
    }
};

/**
 * Checks for the existence and accessibility of robots.txt.
 * @param {URL} siteUrl - The base URL of the site.
 * @returns {Promise<{exists: boolean, content?: string, error?: string}>}
 */
const checkRobotsTxt = async (siteUrl) => {
    const robotsUrl = new URL('/robots.txt', siteUrl.origin).toString();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT / 2); // Shorter timeout for robots.txt

    try {
        const response = await fetch(robotsUrl, {
            headers: { 'User-Agent': getRandomUserAgent() },
            signal: controller.signal,
            redirect: 'follow'
        });
        clearTimeout(timeoutId);

        if (response.ok) {
            const content = await response.text();
            return { exists: true, content: content.slice(0, 5000) }; // Limit content size
        } else if (response.status === 404) {
            return { exists: false };
        } else {
            return {
                exists: false,
                error: `robots.txt check failed with status: ${response.status}`
            };
        }
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            return { exists: false, error: 'robots.txt check timed out' };
        }
        return { exists: false, error: `Error checking robots.txt: ${error.message}` };
    }
};

/**
 * Checks for the existence and accessibility of sitemap.xml (common locations).
 * @param {URL} siteUrl - The base URL of the site.
 * @param {object} robotsAnalysis - Result from checkRobotsTxt.
 * @returns {Promise<{exists: boolean, url?: string, error?: string}>}
 */
const checkSitemap = async (siteUrl, robotsAnalysis) => {
    const potentialSitemapUrls = [new URL('/sitemap.xml', siteUrl.origin).toString()];

    // Check robots.txt for Sitemap directive
    if (robotsAnalysis.exists && robotsAnalysis.content) {
        const sitemapMatch = robotsAnalysis.content.match(/Sitemap:\s*(.*)/i);
        if (sitemapMatch && sitemapMatch[1]) {
            potentialSitemapUrls.unshift(sitemapMatch[1].trim()); // Prioritize sitemap from robots.txt
        }
    }

    for (const sitemapUrl of potentialSitemapUrls) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT / 2);
        try {
            const response = await fetch(sitemapUrl, {
                method: 'HEAD', // Use HEAD request for efficiency
                headers: { 'User-Agent': getRandomUserAgent() },
                signal: controller.signal,
                redirect: 'follow'
            });
            clearTimeout(timeoutId);

            if (response.ok) {
                return { exists: true, url: sitemapUrl };
            }
            // If HEAD fails or is disallowed, try GET for the primary sitemap.xml
            if (
                sitemapUrl === potentialSitemapUrls[potentialSitemapUrls.length - 1] &&
                response.status === 405
            ) {
                const getResponse = await fetch(sitemapUrl, {
                    method: 'GET',
                    headers: { 'User-Agent': getRandomUserAgent() },
                    signal: controller.signal,
                    redirect: 'follow'
                });
                if (getResponse.ok) {
                    return { exists: true, url: sitemapUrl };
                }
            }
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                console.warn(`Sitemap check timed out for ${sitemapUrl}`);
                continue; // Try next potential URL
            }
            console.warn(`Error checking sitemap ${sitemapUrl}: ${error.message}`);
            // Continue checking other potential URLs
        }
    }

    return { exists: false, error: 'Sitemap not found in common locations or robots.txt' };
};

// --- Analysis Functions ---

const analyzeMetaTags = ($) => {
    const title = $('head > title').text().trim();
    const description = $('meta[name="description"]').attr('content')?.trim() || null;
    const keywords = $('meta[name="keywords"]').attr('content')?.trim() || null;
    const viewport = $('meta[name="viewport"]').attr('content')?.trim() || null;
    const canonical = $('link[rel="canonical"]').attr('href')?.trim() || null;
    const ogTitle = $('meta[property="og:title"]').attr('content')?.trim() || null;
    const ogDescription = $('meta[property="og:description"]').attr('content')?.trim() || null;
    const ogImage = $('meta[property="og:image"]').attr('content')?.trim() || null;
    const ogUrl = $('meta[property="og:url"]').attr('content')?.trim() || null;
    const twitterCard = $('meta[name="twitter:card"]').attr('content')?.trim() || null;

    return {
        title: { value: title, length: title.length },
        description: { value: description, length: description?.length || 0 },
        keywords: { value: keywords },
        viewport: { value: viewport },
        canonical: { value: canonical },
        openGraph: {
            title: ogTitle,
            description: ogDescription,
            image: ogImage,
            url: ogUrl
        },
        twitterCard: { value: twitterCard }
    };
};

const analyzeHeadings = ($) => {
    const headings = {};
    let totalHeadings = 0;
    for (let i = 1; i <= 6; i++) {
        const tag = `h${i}`;
        headings[tag] = [];
        $(tag).each((_, element) => {
            const text = $(element).text().trim();
            if (text) {
                headings[tag].push(text);
                totalHeadings++;
            }
        });
    }
    return { headings, totalHeadings };
};

const analyzeImages = ($) => {
    const images = [];
    let missingAltCount = 0;
    $('img').each((_, element) => {
        const src = $(element).attr('src');
        const alt = $(element).attr('alt');
        if (src) {
            images.push({ src, alt: alt || null });
            if (!alt || alt.trim() === '') {
                missingAltCount++;
            }
        }
    });
    return { images, count: images.length, missingAltCount };
};

const analyzeContent = ($, html) => {
    // Basic text extraction (consider more sophisticated methods for readability)
    $('script, style, noscript, svg, header, footer, nav, aside').remove(); // Remove common non-content elements
    const textContent = $('body').text() || '';
    const cleanText = textContent.replace(/\s+/g, ' ').trim();
    const wordCount = cleanText.split(' ').filter(Boolean).length;

    // Basic keyword density (placeholder - requires target keywords)
    // const keywordDensity = {};

    // Simple readability (placeholder - Flesch-Kincaid etc. require more complex libraries)
    const readabilityScore = null; // Placeholder

    return {
        wordCount,
        // keywordDensity,
        readabilityScore
        // Add more content metrics here
    };
};

const checkHttps = (finalUrl) => {
    try {
        const parsedUrl = new URL(finalUrl);
        return { usesHttps: parsedUrl.protocol === 'https:', finalUrl };
    } catch (e) {
        return { usesHttps: false, error: 'Invalid final URL', finalUrl };
    }
};

const checkMobileFriendliness = ($) => {
    // Basic check: viewport meta tag
    const viewport = $('meta[name="viewport"]').attr('content');
    const hasViewport = !!viewport;
    // More advanced checks could involve analyzing CSS, but that's complex server-side
    return {
        hasViewportMeta: hasViewport,
        viewportContent: viewport || null
        // Add results from Google Mobile-Friendly Test API if integrated
    };
};

const checkSchemaMarkup = ($) => {
    const scripts = $('script[type="application/ld+json"]');
    const schemaData = [];
    let hasSchema = false;
    scripts.each((_, element) => {
        try {
            const scriptContent = $(element).html();
            if (scriptContent) {
                schemaData.push(JSON.parse(scriptContent));
                hasSchema = true;
            }
        } catch (e) {
            console.warn('Failed to parse JSON-LD schema:', e.message);
            schemaData.push({
                error: 'Failed to parse',
                content: $(element).html()?.substring(0, 100) + '...'
            });
        }
    });
    return { hasSchema, count: schemaData.length, data: schemaData };
};

// --- Main Analysis Orchestrator ---

/**
 * Performs SEO analysis on a given URL.
 * @param {string} url - The URL to analyze.
 * @returns {Promise<object>} - The analysis report.
 */
export const performSeoAnalysis = async (url) => {
    const startTime = Date.now();
    let siteUrl;
    try {
        siteUrl = new URL(url);
    } catch (e) {
        return {
            error: 'Invalid URL provided',
            status: 400,
            analysisTimeMs: Date.now() - startTime
        };
    }

    const { html, $, finalUrl, status, error: fetchError } = await fetchAndParseUrl(url);

    if (fetchError) {
        return {
            url,
            error: fetchError,
            status: status || 500,
            analysisTimeMs: Date.now() - startTime
        };
    }

    try {
        const robotsAnalysis = await checkRobotsTxt(new URL(finalUrl));
        const sitemapAnalysis = await checkSitemap(new URL(finalUrl), robotsAnalysis);
        const httpsAnalysis = checkHttps(finalUrl);
        const metaTagsAnalysis = analyzeMetaTags($);
        const headingsAnalysis = analyzeHeadings($);
        const imagesAnalysis = analyzeImages($);
        const contentAnalysis = analyzeContent($, html); // Pass original html if needed for deeper analysis
        const mobileAnalysis = checkMobileFriendliness($);
        const schemaAnalysis = checkSchemaMarkup($);
        // Placeholder for Performance Analysis (e.g., Core Web Vitals via PageSpeed Insights API)
        const performanceAnalysis = { status: 'pending_integration' };

        // Placeholder for AI-powered suggestions
        const aiSuggestions = { status: 'pending_integration' };

        const analysisTimeMs = Date.now() - startTime;

        // Construct the report
        const report = {
            url: url,
            finalUrl: finalUrl,
            status: status,
            analysisTimeMs: analysisTimeMs,
            checks: {
                https: httpsAnalysis,
                robotsTxt: robotsAnalysis,
                sitemap: sitemapAnalysis,
                metaTags: metaTagsAnalysis,
                headings: headingsAnalysis,
                images: imagesAnalysis,
                content: contentAnalysis,
                mobileFriendly: mobileAnalysis,
                schemaMarkup: schemaAnalysis,
                performance: performanceAnalysis // Add performance results here
                // Add other checks like links, hreflang etc.
            },
            aiSuggestions: aiSuggestions // Add AI suggestions here
        };

        // Optionally save the report to DB (requires Report model and user context)
        // const savedReport = new Report({ userId: /* get user id */, ...report });
        // await savedReport.save();

        return report;
    } catch (analysisError) {
        console.error(`Analysis error for ${url}:`, analysisError);
        return {
            url: url,
            finalUrl: finalUrl,
            status: status, // Original fetch status
            error: `Analysis failed: ${analysisError.message}`,
            analysisTimeMs: Date.now() - startTime
        };
    }
};

// --- Router ---

// POST /api/search/analyze
router.post('/analyze', authenticateToken, async (req, res) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    // Basic URL validation
    try {
        new URL(url);
    } catch (e) {
        return res.status(400).json({ error: 'Invalid URL format' });
    }

    // Optional: Implement rate limiting per user for analysis endpoint

    // Optional: Implement job queue for long-running analysis
    // For now, run synchronously
    try {
        const report = await performSeoAnalysis(url);

        if (report.error && !report.checks) {
            // If fetching itself failed badly
            return res.status(report.status || 500).json({ error: report.error, url: report.url });
        }

        // TODO: Save report linked to user req.user.id

        res.status(200).json(report);
    } catch (error) {
        console.error('Unhandled analysis error:', error);
        res.status(500).json({ error: 'An unexpected error occurred during analysis.' });
    }
});

export default router;

// --- Deprecated/Irrelevant Functions from AutoResearch ---
// Keeping fetchPageContent logic within fetchAndParseUrl for now.
// fetchSearchResults and searchWebContent are not relevant for Seocheck.my.
/*
export const MAX_SEARCH_RESULT_LENGTH = 7000; // Keep if needed elsewhere, but likely not for SEO analysis

export async function searchWebContent(results) { ... } // Irrelevant
export async function fetchSearchResults(query) { ... } // Irrelevant
export async function fetchPageContent(url) { ... } // Logic merged into fetchAndParseUrl
*/
