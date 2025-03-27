import { useState, useEffect, useContext } from 'react';
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
    useToast
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
    const toast = useToast();
    const navigate = useNavigate();

    useEffect(() => {
        const fetchReports = async () => {
            if (!user) {
                setIsLoadingReports(false);
                return; // No user logged in
            }
            setIsLoadingReports(true);
            setErrorReports(null);
            try {
                const token = localStorage.getItem('token');
                const response = await fetch(`${API_URL}/api/reports/recent`, { // Assuming this endpoint exists
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                });
                if (!response.ok) {
                    throw new Error('Failed to fetch reports');
                }
                const data = await response.json();
                setReports(data);
            } catch (err) {
                setErrorReports(err.message || 'Could not load recent reports.');
                console.error('Error fetching reports:', err);
            } finally {
                setIsLoadingReports(false);
            }
        };

        fetchReports();
    }, [user]); // Re-fetch if user changes

    const handleAnalysisSubmit = async (e) => {
        e.preventDefault();
        if (!urlToAnalyze) {
            toast({
                title: 'URL Required',
                description: 'Please enter a website URL to analyze.',
                status: 'warning',
                duration: 3000,
                isClosable: true
            });
            return;
        }
        setIsAnalyzing(true);
        toast({
            title: 'Starting Analysis',
            description: `Analyzing ${urlToAnalyze}... This may take a moment.`,
            status: 'info',
            duration: 5000,
            isClosable: true
        });

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${API_URL}/api/search`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}` // Include token if analysis is user-specific or requires auth
                },
                body: JSON.stringify({ url: urlToAnalyze })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({})); // Try to parse error response
                throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
            }

            const result = await response.json();

            // Assuming the response contains the ID of the newly created report
            // Or potentially the full report data if processed synchronously
            // For now, let's assume we get an ID and redirect to a report page (which doesn't exist yet)
            // Or maybe just refresh the recent reports list
            toast({
                title: 'Analysis Submitted',
                description: 'Processing your request.', // Modify if synchronous
                status: 'success',
                duration: 3000,
                isClosable: true
            });
             // TODO: Navigate to a specific report page: navigate(`/report/${result.reportId}`);
             // TODO: Or refresh the list: fetchReports(); // Need to extract fetchReports
             setUrlToAnalyze(''); // Clear input after submission


        } catch (error) {
             console.error('Analysis failed:', error);
             toast({
                 title: 'Analysis Failed',
                 description: error.message || 'Could not start analysis.',
                 status: 'error',
                 duration: 5000,
                 isClosable: true
             });
        } finally {
            setIsAnalyzing(false);
        }
    };


    return (
        <Container maxW="container.xl" py={8}>
            <VStack spacing={8} align="stretch">
                <Heading as="h1" size="xl">
                    Dashboard
                </Heading>
                <Text fontSize="lg">Welcome back{user?.firstName ? `, ${user.firstName}` : ''}!</Text>

                {/* Analysis Input Section */}
                 <Card variant="outline">
                    <CardHeader>
                        <Heading size="md">Analyze a Website</Heading>
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
                                    />
                                </FormControl>
                                <Button
                                    type="submit"
                                    colorScheme="primary" // Use theme color
                                    isLoading={isAnalyzing}
                                    loadingText="Analyzing..."
                                    width="full"
                                >
                                    Analyze SEO
                                </Button>
                            </VStack>
                        </form>
                    </CardBody>
                </Card>


                {/* Recent Reports Section */}
                <Box>
                    <Heading size="lg" mb={4}>
                        Recent Analyses
                    </Heading>
                    {isLoadingReports ? (
                        <Box display="flex" justifyContent="center" alignItems="center" minH="100px">
                            <Spinner size="xl" />
                        </Box>
                    ) : errorReports ? (
                        <Alert status="error">
                            <AlertIcon />
                            {errorReports}
                        </Alert>
                    ) : reports.length === 0 ? (
                        <Text>You haven't analyzed any websites yet. Enter a URL above to get started!</Text>
                    ) : (
                        <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={6}>
                            {reports.map((report) => (
                                <Card key={report._id} variant="outline">
                                    <CardHeader>
                                        {/* TODO: Link to the actual report page when available */}
                                        <ChakraLink as={RouterLink} to={`/report/${report._id}`} fontWeight="bold">
                                            {report.url || 'Report'}
                                        </ChakraLink>
                                    </CardHeader>
                                    <CardBody>
                                        <Text fontSize="sm" color="gray.600">
                                            Analyzed on: {new Date(report.createdAt).toLocaleDateString()}
                                        </Text>
                                        {/* Add more summary details here if available, e.g., score */}
                                        {/* <Text mt={2}>Score: {report.overallScore || 'N/A'}</Text> */}
                                    </CardBody>
                                </Card>
                            ))}
                        </SimpleGrid>
                    )}
                </Box>

                 {/* Placeholder for future features like Project Grouping */}
                 {/*
                 <Box>
                     <Heading size="lg" mb={4}>
                         My Projects
                     </Heading>
                     <Text>Organize your analyses into projects (Coming Soon!).</Text>
                 </Box>
                 */}

            </VStack>
        </Container>
    );
};

export default Dashboard;