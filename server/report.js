import express from 'express';
import mongoose from 'mongoose';
import Report from './models/Report.js';
// Note: authenticateToken middleware is applied in server/index.js for the '/api/reports' base path

const router = express.Router();

/**
 * @route GET /api/reports
 * @description Fetch paginated reports for the logged-in user
 * @access Private (requires authentication)
 * @queryparam {number} [page=1] - Page number for pagination
 * @queryparam {number} [limit=10] - Number of reports per page
 */
router.get('/', async (req, res) => {
    try {
        const userId = req.user.id;
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;
        const skip = (page - 1) * limit;

        if (page < 1 || limit < 1) {
            return res.status(400).json({ error: 'Invalid page or limit parameter.' });
        }

        const reportsQuery = Report.find({ userId })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .select(
                '_id url finalUrl overallScore analysisStatus createdAt fetchStatus errorMessage'
            ) // Select concise fields for list view
            .lean(); // Use lean for performance

        const totalReportsQuery = Report.countDocuments({ userId });

        const [reports, totalReports] = await Promise.all([reportsQuery, totalReportsQuery]);

        res.json({
            reports,
            currentPage: page,
            totalPages: Math.ceil(totalReports / limit),
            totalReports
        });
    } catch (error) {
        console.error('Error fetching user reports:', error);
        res.status(500).json({ error: 'Failed to retrieve reports.' });
    }
});

/**
 * @route GET /api/reports/:id
 * @description Fetch a specific report by ID for the logged-in user
 * @access Private (requires authentication)
 * @param {string} id - The MongoDB ObjectId of the report
 */
router.get('/:id', async (req, res) => {
    try {
        const userId = req.user.id;
        const reportId = req.params.id;

        if (!mongoose.Types.ObjectId.isValid(reportId)) {
            return res.status(400).json({ error: 'Invalid report ID format.' });
        }

        const report = await Report.findOne({ _id: reportId, userId }).lean();

        if (!report) {
            return res.status(404).json({ error: 'Report not found or access denied.' });
        }

        res.json(report);
    } catch (error) {
        console.error(`Error fetching report ${req.params.id}:`, error);
        // Handle potential CastError specifically if needed, though findOne usually returns null for non-matching valid format IDs
        if (error.name === 'CastError') {
            return res.status(400).json({ error: 'Invalid report ID format.' });
        }
        res.status(500).json({ error: 'Failed to retrieve the report.' });
    }
});

/**
 * @route DELETE /api/reports/:id
 * @description Delete a specific report by ID for the logged-in user
 * @access Private (requires authentication)
 * @param {string} id - The MongoDB ObjectId of the report
 */
router.delete('/:id', async (req, res) => {
    try {
        const userId = req.user.id;
        const reportId = req.params.id;

        if (!mongoose.Types.ObjectId.isValid(reportId)) {
            return res.status(400).json({ error: 'Invalid report ID format.' });
        }

        const result = await Report.findOneAndDelete({ _id: reportId, userId });

        if (!result) {
            return res.status(404).json({ error: 'Report not found or access denied.' });
        }

        res.status(200).json({ message: 'Report deleted successfully.' });
        // Or use 204 No Content: res.status(204).send();
    } catch (error) {
        console.error(`Error deleting report ${req.params.id}:`, error);
        if (error.name === 'CastError') {
            return res.status(400).json({ error: 'Invalid report ID format.' });
        }
        res.status(500).json({ error: 'Failed to delete the report.' });
    }
});

export default router;
