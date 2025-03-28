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
                // No need to throw error here, just means user is logged out
                navigate('/login');
                return;
            }
            // Assuming endpoint exists - adjust if necessary based on actual backend implementation
            const response = await fetch(`${API_URL}/api/reports/recent`, {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });
            if (response.status === 401) {
                localStorage.removeItem('token'); // Clear invalid token
                toast({
                    title: 'Session Expired',
                    description: 'Please log in again.',
                    status: 'warning',
                    duration: 3000,
                    isClosable: true
                });
                navigate('/login');
                return; // Stop execution after redirect
            }
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || 'Failed to fetch reports');
            }
            const data = await response.json();
            setReports(Array.isArray(data) ? data : []);
        } catch (err) {
            setErrorReports(err.message || 'Could not load recent reports.');
            console.error('Error fetching reports:', err);
            setReports([]); // Ensure reports is an empty array on error
        } finally {
            setIsLoadingReports(false);
        }
    }, [user, navigate, toast]); // Added toast to dependency array

    useEffect(() => {
        // Redirect to login if user context is null (e.g., after logout)
        if (!localStorage.getItem('token') && !user) {
            navigate('/login');
        } else {
            fetchReports();
        }
    }, [fetchReports, user, navigate]); // Added user and navigate

    // Placeholder for polling analysis status if backend is async
    // const pollAnalysisStatus = async (reportId) => { ... };

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

        try {
            // Basic URL validation - ensure it includes a protocol
            const parsedUrl = new URL(trimmedUrl);
            if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
                throw new Error('URL must start with http:// or https://');
            }
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
            description: `Analyzing ${trimmedUrl}... This may take some time.`,
            status: 'info',
            duration: 5000,
            isClosable: true
        });

        try {
            const token = localStorage.getItem('token');
            if (!token) {
                navigate('/login');
                // No need to throw error here, navigation handles it
                return;
            }

            // Using '/api/search/analyze' as defined in server/search.js
            // Assuming server/index.js mounts the search router at /api/search
            const response = await fetch(`${API_URL}/api/search/analyze`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ url: trimmedUrl })
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
                return; // Stop execution
            }

            if (response.status === 429) {
                // Handle rate limiting specifically
                const errorData = await response
                    .json()
                    .catch(() => ({ message: 'Rate limit exceeded.' }));
                throw new Error(errorData.message || 'Too many requests. Please try again later.');
            }

            if (!response.ok) {
                const errorData = await response
                    .json()
                    .catch(() => ({ message: `HTTP error! Status: ${response.status}` }));
                throw new Error(errorData.message || `Analysis request failed.`);
            }

            const result = await response.json();

            // Handle different response structures (sync/async/detailed report)
            // Assuming a successful response returns the report object directly or an ID for polling
            if (result._id || (result.url && result.checks)) {
                // Sync path or fast async returning full report
                toast({
                    title: 'Analysis Complete',
                    description: `Analysis for ${result.url || trimmedUrl} finished.`,
                    status: 'success',
                    duration: 4000,
                    isClosable: true
                });
                setUrlToAnalyze('');
                fetchReports(); // Refresh list to include the new report
                setAnalysisStatus('Analysis complete. Refreshing list...');
                setAnalysisProgress(100);
                setTimeout(() => {
                    setAnalysisStatus('');
                    setAnalysisProgress(0);
                    setIsAnalyzing(false);
                }, 3000);
                // Optionally navigate: navigate(`/report/${result._id}`);
            } else if (result.reportId && result.status === 'pending') {
                // Async path (explicitly indicated by backend)
                toast({
                    title: 'Analysis Queued',
                    description: 'Your analysis request is processing in the background.',
                    status: 'info', // Use info for queued status
                    duration: 4000,
                    isClosable: true
                });
                setUrlToAnalyze('');
                fetchReports(); // Refresh list optimistically (might show pending status)
                setAnalysisStatus('Analysis queued. Refreshing list...');
                setAnalysisProgress(10);
                // pollAnalysisStatus(result.reportId); // Start polling if implemented
                setTimeout(() => {
                    setAnalysisStatus('');
                    setAnalysisProgress(0);
                    setIsAnalyzing(false); // Re-enable button after delay
                }, 5000);
            } else {
                // Fallback for unexpected success response
                console.warn('Received unexpected successful response:', result);
                toast({
                    title: 'Analysis Submitted',
                    description: 'Request received, refreshing list.',
                    status: 'success',
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
            setAnalysisStatus('Analysis failed.');
            setAnalysisProgress(0);
            setIsAnalyzing(false); // Re-enable button on failure
        }
    };

    // Determine overall score color
    const getScoreColor = (score) => {
        if (score === null || score === undefined) return 'gray.500';
        if (score > 75) return 'green.500';
        if (score > 50) return 'orange.500';
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

                <Card variant="outline" shadow="sm">
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
                                >
                                    Analyze SEO
                                </Button>
                                {isAnalyzing && analysisProgress > 0 && (
                                    <Box w="full" mt={2}>
                                        <Progress
                                            value={analysisProgress}
                                            size="sm"
                                            colorScheme="primary"
                                            isAnimated={analysisProgress < 100}
                                            hasStripe={analysisProgress < 100}
                                            borderRadius="md"
                                        />
                                        {analysisStatus && (
                                            <Text
                                                fontSize="sm"
                                                color="gray.600"
                                                mt={1}
                                                textAlign="center"
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
                        <Center minH="150px">
                            <Spinner size="xl" color="primary.500" thickness="4px" />
                        </Center>
                    ) : errorReports ? (
                        <Alert status="error" variant="subtle" borderRadius="md">
                            <AlertIcon />
                            <Text>{errorReports}</Text>
                        </Alert>
                    ) : reports.length === 0 ? (
                        <Card variant="outline" p={5} textAlign="center" bg="background.100">
                            <Text color="gray.600">
                                You haven&apos;t analyzed any websites yet. Enter a URL above to get
                                started!
                            </Text>
                        </Card>
                    ) : (
                        <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={6}>
                            {reports.map((report) => (
                                <Card
                                    key={report._id}
                                    variant="outline"
                                    shadow="sm"
                                    _hover={{ shadow: 'md', borderColor: 'primary.500' }}
                                    transition="all 0.2s ease-in-out"
                                >
                                    <CardHeader pb={2}>
                                        <Heading
                                            size="sm"
                                            noOfLines={1}
                                            title={report.finalUrl || report.url || ''}
                                        >
                                            {/* Ensure '/report/:id' route exists and handles report display */}
                                            <ChakraLink
                                                as={RouterLink}
                                                to={`/report/${report._id}`}
                                                color="primary.600"
                                                fontWeight="semibold"
                                                _hover={{ textDecoration: 'underline' }}
                                            >
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
                                        {/* TODO: Define how overallScore is calculated and stored in Report model */}
                                        {report.overallScore !== undefined &&
                                        report.overallScore !== null ? (
                                            <Text fontWeight="medium">
                                                Overall Score:{' '}
                                                <Text
                                                    as="span"
                                                    color={getScoreColor(report.overallScore)}
                                                    fontWeight="bold"
                                                >
                                                    {report.overallScore}%
                                                </Text>
                                            </Text>
                                        ) : report.status === 'pending' ||
                                          report.status === 'processing' ? (
                                            <Text fontSize="sm" fontStyle="italic" color="blue.500">
                                                Status: Processing...
                                            </Text>
                                        ) : (
                                            <Text fontSize="sm" fontStyle="italic" color="gray.400">
                                                Score not available
                                            </Text>
                                        )}
                                        {/* Display specific status if not completed and score is missing */}
                                        {report.status &&
                                            report.status !== 'completed' &&
                                            report.overallScore === undefined && (
                                                <Text
                                                    fontSize="xs"
                                                    color="orange.500"
                                                    mt={1}
                                                    textTransform="capitalize"
                                                >
                                                    Status: {report.status}
                                                </Text>
                                            )}
                                        <Button
                                            as={RouterLink}
                                            to={`/report/${report._id}`}
                                            size="sm"
                                            variant="outline"
                                            colorScheme="secondary"
                                            mt={3}
                                            width="full"
                                            // Disable button if report is still processing heavily?
                                            // isDisabled={report.status === 'pending' || report.status === 'processing'}
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
