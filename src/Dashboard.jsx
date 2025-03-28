import { useState, useEffect, useContext, useCallback } from 'react';
import {
    Box,
    Button,
    Container,
    Heading,
    VStack,
    Text,
    Input,
    FormControl,
    FormLabel,
    SimpleGrid,
    Card,
    CardHeader,
    CardBody,
    Spinner,
    Alert,
    AlertIcon,
    Link as ChakraLink,
    useToast,
    Progress,
    Center
} from '@chakra-ui/react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { API_URL, UserContext } from './App';

const Dashboard = () => {
    const { user } = useContext(UserContext);
    const [reports, setReports] = useState([]);
    const [isLoadingReports, setIsLoadingReports] = useState(true);
    const [errorReports, setErrorReports] = useState(null);
    const [urlToAnalyze, setUrlToAnalyze] = useState('');
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisProgress, setAnalysisProgress] = useState(0);
    const [analysisStatus, setAnalysisStatus] = useState('');
    const toast = useToast();
    const navigate = useNavigate();

    const fetchReports = useCallback(async () => {
        if (!user) {
            setIsLoadingReports(false);
            setReports([]);
            return;
        }
        setIsLoadingReports(true);
        setErrorReports(null);
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                navigate('/login');
                return;
            }
            // Fetch recent reports - Adjust endpoint or params if needed
            const response = await fetch(`${API_URL}/api/reports/recent`, {
                // Uses the /recent endpoint
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });
            if (response.status === 401) {
                localStorage.removeItem('token');
                toast({
                    title: 'Session Expired',
                    description: 'Please log in again.',
                    status: 'warning',
                    duration: 3000,
                    isClosable: true
                });
                navigate('/login');
                return;
            }
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || 'Failed to fetch reports');
            }
            const data = await response.json();
            // Ensure data is always an array, even if API returns non-array on success/empty
            setReports(Array.isArray(data) ? data : []);
        } catch (err) {
            setErrorReports(err.message || 'Could not load recent reports.');
            console.error('Error fetching reports:', err);
            setReports([]); // Ensure reports is an empty array on error
        } finally {
            setIsLoadingReports(false);
        }
    }, [user, navigate, toast]);

    useEffect(() => {
        if (!localStorage.getItem('token') && !user) {
            navigate('/login');
        } else if (user) {
            // Fetch only if user context is available
            fetchReports();
        }
        // If user is null but token exists, App.jsx effect handles profile fetching/redirect
    }, [fetchReports, user, navigate]);

    const handleAnalysisSubmit = async (e) => {
        e.preventDefault();
        const trimmedUrl = urlToAnalyze.trim();
        if (!trimmedUrl) {
            toast({
                title: 'URL Required',
                description: 'Please enter a website URL to analyze.',
                status: 'warning',
                duration: 3000,
                isClosable: true
            });
            return;
        }

        let parsedUrl;
        try {
            parsedUrl = new URL(trimmedUrl);
            if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
                throw new Error('URL must start with http:// or https://');
            }
            // Optional: Add more validation like checking for valid hostname if needed
        } catch (err) {
            toast({
                title: 'Invalid URL',
                description:
                    err.message || 'Please enter a valid website URL (e.g., https://example.com).',
                status: 'error',
                duration: 4000,
                isClosable: true
            });
            return;
        }

        setIsAnalyzing(true);
        setAnalysisStatus('Submitting analysis request...');
        setAnalysisProgress(5);
        toast({
            title: 'Starting Analysis',
            description: `Analyzing ${parsedUrl.origin}... This may take some time.`,
            status: 'info',
            duration: 5000,
            isClosable: true
        });

        try {
            const token = localStorage.getItem('token');
            if (!token) {
                navigate('/login');
                return;
            }

            const response = await fetch(`${API_URL}/api/search/analyze`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ url: trimmedUrl }) // Send the original trimmed URL
            });

            if (response.status === 401) {
                localStorage.removeItem('token');
                toast({
                    title: 'Session Expired',
                    description: 'Please log in again.',
                    status: 'warning',
                    duration: 3000,
                    isClosable: true
                });
                navigate('/login');
                return;
            }

            if (response.status === 429) {
                const errorData = await response
                    .json()
                    .catch(() => ({ message: 'Rate limit exceeded.' }));
                throw new Error(errorData.message || 'Too many requests. Please try again later.');
            }

            const result = await response.json(); // Attempt to parse JSON regardless of status code first

            if (!response.ok) {
                // Use parsed error message if available, otherwise generate one
                throw new Error(
                    result.message ||
                        result.error ||
                        `Analysis request failed. Status: ${response.status}`
                );
            }

            // Handle successful response (sync or async confirmation)
            if (
                result._id ||
                (result.url && result.checks) ||
                (result.reportId && result.status === 'pending')
            ) {
                const reportUrl = result.url || result.finalUrl || trimmedUrl;
                const isAsync = result.reportId && result.status === 'pending';

                toast({
                    title: isAsync ? 'Analysis Queued' : 'Analysis Complete',
                    description: isAsync
                        ? `Analysis for ${reportUrl} is processing.`
                        : `Analysis for ${reportUrl} finished.`,
                    status: isAsync ? 'info' : 'success',
                    duration: 4000,
                    isClosable: true
                });

                setUrlToAnalyze('');
                fetchReports(); // Refresh the list
                setAnalysisStatus(
                    isAsync
                        ? 'Analysis queued. Refreshing list...'
                        : 'Analysis complete. Refreshing list...'
                );
                setAnalysisProgress(isAsync ? 10 : 100); // Show minimal progress for async

                // Reset UI state after a delay
                setTimeout(
                    () => {
                        setAnalysisStatus('');
                        setAnalysisProgress(0);
                        setIsAnalyzing(false);
                        // Optionally navigate to the report page if sync and _id is available
                        // if (!isAsync && result._id) {
                        //     navigate(`/report/${result._id}`);
                        // }
                    },
                    isAsync ? 5000 : 3000
                ); // Longer delay for async to let user see queue message
            } else {
                // Handle unexpected successful response structure
                console.warn('Received unexpected successful analysis response:', result);
                toast({
                    title: 'Analysis Submitted',
                    description:
                        'Request received, but response format was unexpected. Refreshing list.',
                    status: 'warning', // Use warning for unexpected format
                    duration: 4000,
                    isClosable: true
                });
                setUrlToAnalyze('');
                fetchReports();
                setAnalysisStatus('Refreshing list...');
                setAnalysisProgress(100); // Assume completion for now
                setTimeout(() => {
                    setAnalysisStatus('');
                    setAnalysisProgress(0);
                    setIsAnalyzing(false);
                }, 3000);
            }
        } catch (error) {
            console.error('Analysis failed:', error);
            toast({
                title: 'Analysis Failed',
                description: error.message || 'Could not start analysis.',
                status: 'error',
                duration: 5000,
                isClosable: true
            });
            setAnalysisStatus(`Analysis failed: ${error.message}`);
            setAnalysisProgress(0); // Reset progress on failure
            // Keep isAnalyzing true briefly so user sees the error message with progress bar at 0
            setTimeout(() => setIsAnalyzing(false), 1500);
        }
    };

    const getScoreColor = (score) => {
        if (score === null || score === undefined) return 'gray.500';
        if (score >= 80) return 'green.500'; // Adjusted thresholds slightly
        if (score >= 50) return 'orange.500';
        return 'red.500';
    };

    return (
        <Container maxW="container.xl" py={8}>
            <VStack spacing={8} align="stretch">
                <Heading as="h1" size="xl" textAlign={{ base: 'center', md: 'left' }}>
                    Dashboard
                </Heading>
                <Text fontSize="lg" textAlign={{ base: 'center', md: 'left' }}>
                    Welcome back{user?.firstName ? `, ${user.firstName}` : ''}!
                </Text>

                <Card variant="outline" shadow="sm" data-testid="analysis-form-card">
                    <CardHeader>
                        <Heading size="md">Analyze a Website&apos;s SEO</Heading>
                    </CardHeader>
                    <CardBody>
                        <form onSubmit={handleAnalysisSubmit}>
                            <VStack spacing={4}>
                                <FormControl isRequired>
                                    <FormLabel htmlFor="url">Website URL</FormLabel>
                                    <Input
                                        id="url"
                                        type="url"
                                        placeholder="https://example.com"
                                        value={urlToAnalyze}
                                        onChange={(e) => setUrlToAnalyze(e.target.value)}
                                        disabled={isAnalyzing}
                                        size="lg"
                                        data-testid="url-input"
                                    />
                                </FormControl>
                                <Button
                                    type="submit"
                                    colorScheme="primary"
                                    isLoading={isAnalyzing}
                                    loadingText="Analyzing..."
                                    width="full"
                                    size="lg"
                                    disabled={isAnalyzing}
                                    data-testid="analyze-button"
                                >
                                    Analyze SEO
                                </Button>
                                {isAnalyzing && (
                                    <Box w="full" mt={2}>
                                        <Progress
                                            value={analysisProgress}
                                            size="sm"
                                            colorScheme="primary"
                                            isAnimated={
                                                analysisProgress < 100 && analysisProgress > 0
                                            }
                                            hasStripe={
                                                analysisProgress < 100 && analysisProgress > 0
                                            }
                                            borderRadius="md"
                                            data-testid="analysis-progress"
                                        />
                                        {analysisStatus && (
                                            <Text
                                                fontSize="sm"
                                                color="gray.600"
                                                mt={1}
                                                textAlign="center"
                                                data-testid="analysis-status"
                                            >
                                                {analysisStatus}
                                            </Text>
                                        )}
                                    </Box>
                                )}
                            </VStack>
                        </form>
                    </CardBody>
                </Card>

                <Box>
                    <Heading size="lg" mb={4}>
                        Recent Analyses
                    </Heading>
                    {isLoadingReports ? (
                        <Center minH="150px" data-testid="reports-loading">
                            <Spinner size="xl" color="primary.500" thickness="4px" />
                        </Center>
                    ) : errorReports ? (
                        <Alert
                            status="error"
                            variant="subtle"
                            borderRadius="md"
                            data-testid="reports-error"
                        >
                            <AlertIcon />
                            <Text>{errorReports}</Text>
                        </Alert>
                    ) : reports.length === 0 ? (
                        <Card
                            variant="outline"
                            p={5}
                            textAlign="center"
                            bg="background.100"
                            data-testid="no-reports-card"
                        >
                            <Text color="gray.600">
                                You haven&apos;t analyzed any websites yet. Enter a URL above to get
                                started!
                            </Text>
                        </Card>
                    ) : (
                        <SimpleGrid
                            columns={{ base: 1, md: 2, lg: 3 }}
                            spacing={6}
                            data-testid="reports-grid"
                        >
                            {reports.map((report) => (
                                <Card
                                    key={report._id}
                                    variant="outline"
                                    shadow="sm"
                                    _hover={{ shadow: 'md', borderColor: 'primary.500' }}
                                    transition="all 0.2s ease-in-out"
                                    data-testid={`report-card-${report._id}`}
                                >
                                    <CardHeader pb={2}>
                                        <Heading
                                            size="sm"
                                            noOfLines={1}
                                            title={
                                                report.finalUrl ||
                                                report.url ||
                                                `Report ${report._id}`
                                            } // Tooltip for long URLs
                                        >
                                            <ChakraLink
                                                as={RouterLink}
                                                to={`/report/${report._id}`} // Correct link format
                                                color="primary.600"
                                                fontWeight="semibold"
                                                _hover={{ textDecoration: 'underline' }}
                                                data-testid={`report-link-title-${report._id}`}
                                            >
                                                {/* Display finalUrl if available, fallback to original url */}
                                                {report.finalUrl ||
                                                    report.url ||
                                                    `Report ${report._id.slice(-6)}`}
                                            </ChakraLink>
                                        </Heading>
                                    </CardHeader>
                                    <CardBody pt={0}>
                                        <Text fontSize="sm" color="gray.500" mb={2}>
                                            Analyzed:{' '}
                                            {new Date(
                                                report.createdAt || Date.now()
                                            ).toLocaleDateString()}
                                        </Text>
                                        {/* Display Score or Status */}
                                        {(report.analysisStatus === 'completed' ||
                                            report.fetchStatus === 'success') &&
                                        report.overallScore !== undefined &&
                                        report.overallScore !== null ? (
                                            <Text
                                                fontWeight="medium"
                                                data-testid={`report-score-${report._id}`}
                                            >
                                                Overall Score:{' '}
                                                <Text
                                                    as="span"
                                                    color={getScoreColor(report.overallScore)}
                                                    fontWeight="bold"
                                                >
                                                    {report.overallScore}%
                                                </Text>
                                            </Text>
                                        ) : report.analysisStatus === 'pending' ||
                                          report.analysisStatus === 'processing' ||
                                          report.fetchStatus === 'pending' ? (
                                            <Text
                                                fontSize="sm"
                                                fontStyle="italic"
                                                color="blue.500"
                                                data-testid={`report-status-processing-${report._id}`}
                                            >
                                                Status: Processing...
                                            </Text>
                                        ) : report.fetchStatus === 'error' ||
                                          report.analysisStatus === 'error' ? (
                                            <Text
                                                fontSize="sm"
                                                fontStyle="italic"
                                                color="red.500"
                                                data-testid={`report-status-error-${report._id}`}
                                                title={
                                                    report.errorMessage ||
                                                    'An error occurred during analysis'
                                                }
                                            >
                                                Status: Error
                                            </Text>
                                        ) : (
                                            <Text
                                                fontSize="sm"
                                                fontStyle="italic"
                                                color="gray.400"
                                                data-testid={`report-status-unknown-${report._id}`}
                                            >
                                                Status: Unknown
                                            </Text>
                                        )}
                                        {/* Display more specific status if needed */}
                                        {report.analysisStatus &&
                                            report.analysisStatus !== 'completed' &&
                                            report.fetchStatus !== 'error' &&
                                            (report.overallScore === undefined ||
                                                report.overallScore === null) && (
                                                <Text
                                                    fontSize="xs"
                                                    color="orange.500"
                                                    mt={1}
                                                    textTransform="capitalize"
                                                    data-testid={`report-analysis-status-${report._id}`}
                                                >
                                                    Stage: {report.analysisStatus}
                                                </Text>
                                            )}

                                        <Button
                                            as={RouterLink}
                                            to={`/report/${report._id}`} // Correct link format
                                            size="sm"
                                            variant="outline"
                                            colorScheme="secondary"
                                            mt={3}
                                            width="full"
                                            // Disable button only if fetch failed completely? Or allow viewing partial/failed reports?
                                            isDisabled={
                                                report.fetchStatus === 'error' &&
                                                !report.analysisStatus
                                            } // Example: Disable if fetch itself failed before analysis started
                                            data-testid={`view-report-button-${report._id}`}
                                        >
                                            View Report
                                        </Button>
                                    </CardBody>
                                </Card>
                            ))}
                        </SimpleGrid>
                    )}
                </Box>

                {/* Placeholder for Project Organization Feature */}
                <Card variant="outline" shadow="sm" bg="background.100">
                    <CardHeader>
                        <Heading size="md">My Projects</Heading>
                    </CardHeader>
                    <CardBody>
                        <Text color="gray.500">
                            Organize your analyses into projects for better tracking and comparison.
                            (Coming Soon!)
                        </Text>
                        {/* Future: Add button to create project or list existing projects */}
                    </CardBody>
                </Card>
            </VStack>
        </Container>
    );
};

export default Dashboard;
