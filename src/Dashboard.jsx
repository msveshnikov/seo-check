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
                throw new Error('Authentication token not found.');
            }
            // Assuming endpoint exists - adjust if necessary
            const response = await fetch(`${API_URL}/api/reports/recent`, {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });
            if (response.status === 401) {
                localStorage.removeItem('token');
                navigate('/login');
                throw new Error('Unauthorized. Please log in again.');
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
            setReports([]);
        } finally {
            setIsLoadingReports(false);
        }
    }, [user, navigate]);

    useEffect(() => {
        fetchReports();
    }, [fetchReports]);

    // Placeholder for polling analysis status if backend is async
    // const pollAnalysisStatus = async (reportId) => { ... };

    const handleAnalysisSubmit = async (e) => {
        e.preventDefault();
        if (!urlToAnalyze.trim()) {
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
            // Basic URL validation
            new URL(urlToAnalyze);
        } catch {
            toast({
                title: 'Invalid URL',
                description: 'Please enter a valid website URL (e.g., https://example.com).',
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
            description: `Analyzing ${urlToAnalyze}... This may take some time.`,
            status: 'info',
            duration: 5000,
            isClosable: true
        });

        try {
            const token = localStorage.getItem('token');
            if (!token) {
                navigate('/login');
                throw new Error('Authentication required.');
            }

            const response = await fetch(`${API_URL}/api/search`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ url: urlToAnalyze })
            });

            if (response.status === 401) {
                localStorage.removeItem('token');
                navigate('/login');
                throw new Error('Unauthorized. Please log in again.');
            }

            if (!response.ok) {
                const errorData = await response
                    .json()
                    .catch(() => ({ message: `HTTP error! Status: ${response.status}` }));
                throw new Error(errorData.message || `Analysis request failed.`);
            }

            const result = await response.json();

            // Handle async vs sync response based on expected API behavior
            if (result.reportId && result.status === 'pending') {
                // Async path
                toast({
                    title: 'Analysis Queued',
                    description: 'Your analysis request has been submitted and is processing.',
                    status: 'success',
                    duration: 4000,
                    isClosable: true
                });
                setUrlToAnalyze('');
                fetchReports(); // Refresh list optimistically
                setAnalysisStatus('Analysis queued. Refreshing list...');
                setAnalysisProgress(10);
                // pollAnalysisStatus(result.reportId); // Start polling if implemented
                setTimeout(() => {
                    // Reset status indicator after delay
                    setAnalysisStatus('');
                    setAnalysisProgress(0);
                    setIsAnalyzing(false); // Re-enable button after delay
                }, 5000);
            } else if (result._id && result.url) {
                // Sync path (or fast async)
                toast({
                    title: 'Analysis Complete',
                    description: `Analysis for ${result.url} finished.`,
                    status: 'success',
                    duration: 4000,
                    isClosable: true
                });
                setUrlToAnalyze('');
                fetchReports(); // Refresh list
                setAnalysisStatus('Analysis complete. Refreshing list...');
                setAnalysisProgress(100);
                setTimeout(() => {
                    // Reset status indicator after delay
                    setAnalysisStatus('');
                    setAnalysisProgress(0);
                    setIsAnalyzing(false); // Re-enable button after delay
                }, 3000);
                // Optionally navigate: navigate(`/report/${result._id}`);
            } else {
                throw new Error('Received an unexpected response from the server.');
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
        // Note: setIsAnalyzing(false) is handled within success/error/timeout paths now
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
                                <FormControl
                                    isRequired
                                    isInvalid={!urlToAnalyze && isAnalyzing && !urlToAnalyze.trim()}
                                >
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
                                            isAnimated
                                            hasStripe={analysisProgress < 100}
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
                            <Text>Error loading reports: {errorReports}</Text>
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
                                        <Heading size="sm" noOfLines={1} title={report.url || ''}>
                                            {/* TODO: Ensure '/report/:id' route exists and handles report display */}
                                            <ChakraLink
                                                as={RouterLink}
                                                to={`/report/${report._id}`}
                                                color="primary.600"
                                                fontWeight="semibold"
                                            >
                                                {report.url || `Report ${report._id.slice(-6)}`}
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
                                        {report.overallScore !== undefined &&
                                        report.overallScore !== null ? (
                                            <Text fontWeight="medium">
                                                Overall Score:{' '}
                                                <Text
                                                    as="span"
                                                    color={
                                                        report.overallScore > 75
                                                            ? 'green.500'
                                                            : report.overallScore > 50
                                                              ? 'orange.500'
                                                              : 'red.500'
                                                    }
                                                >
                                                    {report.overallScore}%
                                                </Text>
                                            </Text>
                                        ) : (
                                            <Text fontSize="sm" fontStyle="italic" color="gray.400">
                                                Score pending...
                                            </Text>
                                        )}
                                        {report.status && report.status !== 'completed' && (
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
                                        >
                                            View Report
                                        </Button>
                                    </CardBody>
                                </Card>
                            ))}
                        </SimpleGrid>
                    )}
                </Box>

                <Card variant="outline" shadow="sm" bg="background.100">
                    <CardHeader>
                        <Heading size="md">My Projects</Heading>
                    </CardHeader>
                    <CardBody>
                        <Text color="gray.500">
                            Organize your analyses into projects for better tracking and comparison.
                            (Coming Soon!)
                        </Text>
                    </CardBody>
                </Card>
            </VStack>
        </Container>
    );
};

export default Dashboard;
