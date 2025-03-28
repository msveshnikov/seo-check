import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Box,
    Heading,
    Text,
    Spinner,
    Alert,
    AlertIcon,
    Container,
    VStack,
    HStack,
    Tag,
    SimpleGrid,
    Card,
    CardHeader,
    CardBody,
    Link as ChakraLink,
    Button,
    Center,
    CircularProgress,
    CircularProgressLabel,
    useToast,
    Code,
    Badge
} from '@chakra-ui/react';
import { API_URL } from './App';
import { ArrowBackIcon } from '@chakra-ui/icons';

// Helper function to determine status color
const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
        case 'passed':
        case 'ok':
        case 'success':
        case 'completed':
        case 'found':
            return 'green';
        case 'failed':
        case 'error':
        case 'missing':
            return 'red';
        case 'warning':
        case 'partial':
        case 'mixed':
            return 'orange';
        case 'pending':
        case 'processing':
        case 'running':
            return 'blue';
        case 'info':
        case 'not applicable':
            return 'gray';
        default:
            return 'gray';
    }
};

// Helper function to format check names
const formatCheckName = (name) => {
    return name
        .replace(/([A-Z])/g, ' $1') // Add space before capital letters
        .replace(/^./, (str) => str.toUpperCase()); // Capitalize first letter
};

// Helper to determine overall score color
const getScoreColor = (score) => {
    if (score === null || score === undefined) return 'gray';
    if (score >= 90) return 'green';
    if (score >= 50) return 'orange';
    return 'red';
};

const Report = () => {
    const { reportId } = useParams();
    const [report, setReport] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const navigate = useNavigate();
    const toast = useToast();

    useEffect(() => {
        const fetchReport = async () => {
            if (!reportId) {
                setError('No report ID provided.');
                setIsLoading(false);
                return;
            }

            const token = localStorage.getItem('token');
            if (!token) {
                navigate('/login'); // Redirect if not logged in
                return;
            }

            setIsLoading(true);
            setError(null);

            try {
                const response = await fetch(`${API_URL}/api/reports/${reportId}`, {
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

                if (response.status === 404) {
                    setError('Report not found or you do not have access.');
                    setIsLoading(false);
                    return;
                }

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(
                        errorData.message || `Failed to fetch report (${response.status})`
                    );
                }

                const data = await response.json();
                setReport(data);
            } catch (err) {
                console.error('Error fetching report:', err);
                setError(err.message || 'An unexpected error occurred while fetching the report.');
            } finally {
                setIsLoading(false);
            }
        };

        fetchReport();
    }, [reportId, navigate, toast]); // Rerun if reportId changes

    // Display loading state
    if (isLoading) {
        return (
            <Center height="60vh">
                <Spinner size="xl" color="primary.500" thickness="4px" />
                <Text ml={4}>Loading Report...</Text>
            </Center>
        );
    }

    // Display error state
    if (error) {
        return (
            <Container maxW="container.md" py={8}>
                <Alert status="error" variant="subtle" borderRadius="md">
                    <AlertIcon />
                    <Text>{error}</Text>
                </Alert>
                <Button
                    leftIcon={<ArrowBackIcon />}
                    mt={4}
                    onClick={() => navigate('/dashboard')}
                    variant="outline"
                >
                    Back to Dashboard
                </Button>
            </Container>
        );
    }

    // Display if report data is somehow null/empty after loading without error
    if (!report) {
        return (
            <Container maxW="container.md" py={8}>
                <Alert status="warning" variant="subtle" borderRadius="md">
                    <AlertIcon />
                    <Text>Report data could not be loaded.</Text>
                </Alert>
                <Button
                    leftIcon={<ArrowBackIcon />}
                    mt={4}
                    onClick={() => navigate('/dashboard')}
                    variant="outline"
                >
                    Back to Dashboard
                </Button>
            </Container>
        );
    }

    // Render the report details
    const checks = report.checks || [];
    const overallScore = report.overallScore; // Assuming this exists
    const analysisStatus = report.analysisStatus || 'Unknown';
    const fetchStatus = report.fetchStatus || 'Unknown';
    const createdAt = new Date(report.createdAt || Date.now()).toLocaleString();
    const finalUrl = report.finalUrl || report.url;

    return (
        <Container maxW="container.xl" py={8}>
            <VStack spacing={8} align="stretch">
                {/* Back Button */}
                <Button
                    leftIcon={<ArrowBackIcon />}
                    onClick={() => navigate('/dashboard')}
                    variant="ghost"
                    alignSelf="flex-start"
                    mb={-4} // Adjust spacing
                >
                    Back to Dashboard
                </Button>

                {/* Report Header */}
                <Box textAlign={{ base: 'center', md: 'left' }}>
                    <Heading as="h1" size="xl" mb={2}>
                        SEO Analysis Report
                    </Heading>
                    <ChakraLink
                        href={finalUrl}
                        isExternal
                        color="primary.600"
                        fontSize="lg"
                        fontWeight="medium"
                        _hover={{ textDecoration: 'underline' }}
                        maxW="100%"
                        overflow="hidden"
                        textOverflow="ellipsis"
                        whiteSpace="nowrap"
                        display="inline-block"
                        title={finalUrl}
                    >
                        {finalUrl}
                    </ChakraLink>
                    <Text fontSize="sm" color="gray.500" mt={1}>
                        Analyzed on: {createdAt}
                    </Text>
                </Box>

                {/* Overall Score and Status */}
                <Card variant="outline" shadow="sm">
                    <CardBody>
                        <SimpleGrid columns={{ base: 1, md: 3 }} spacing={6} alignItems="center">
                            <Box textAlign="center">
                                <Text fontSize="sm" color="gray.600" mb={2}>
                                    Overall Score
                                </Text>
                                {overallScore !== null && overallScore !== undefined ? (
                                    <CircularProgress
                                        value={overallScore}
                                        color={getScoreColor(overallScore) + '.400'}
                                        size="100px"
                                        thickness="8px"
                                    >
                                        <CircularProgressLabel
                                            fontSize="2xl"
                                            fontWeight="bold"
                                            color={getScoreColor(overallScore) + '.600'}
                                        >
                                            {overallScore}%
                                        </CircularProgressLabel>
                                    </CircularProgress>
                                ) : (
                                    <Text color="gray.500" fontStyle="italic">
                                        Not Available
                                    </Text>
                                )}
                            </Box>
                            <VStack align="start" spacing={3}>
                                <HStack>
                                    <Text fontWeight="medium">Fetch Status:</Text>
                                    <Tag size="md" colorScheme={getStatusColor(fetchStatus)}>
                                        {fetchStatus}
                                    </Tag>
                                </HStack>
                                <HStack>
                                    <Text fontWeight="medium">Analysis Status:</Text>
                                    <Tag size="md" colorScheme={getStatusColor(analysisStatus)}>
                                        {analysisStatus}
                                    </Tag>
                                </HStack>
                                {report.errorMessage && (
                                    <Alert status="error" size="sm" borderRadius="md">
                                        <AlertIcon boxSize="16px" />
                                        <Text fontSize="xs">{report.errorMessage}</Text>
                                    </Alert>
                                )}
                            </VStack>
                            <Box textAlign={{ base: 'center', md: 'right' }}>
                                {/* Add actions like Re-analyze or Export here if needed */}
                                {/* <Button colorScheme="primary" variant="outline">Re-Analyze</Button> */}
                            </Box>
                        </SimpleGrid>
                    </CardBody>
                </Card>

                {/* Analysis Checks Details */}
                <Heading size="lg" mt={6} mb={4}>
                    Analysis Details
                </Heading>
                {checks.length > 0 ? (
                    <SimpleGrid columns={{ base: 1, md: 2 }} spacing={6}>
                        {checks.map((check, index) => (
                            <Card key={index} variant="outline" shadow="sm">
                                <CardHeader pb={2}>
                                    <HStack justify="space-between">
                                        <Heading size="sm">{formatCheckName(check.name)}</Heading>
                                        <Tag size="sm" colorScheme={getStatusColor(check.status)}>
                                            {check.status || 'Info'}
                                        </Tag>
                                    </HStack>
                                </CardHeader>
                                <CardBody pt={2}>
                                    {check.description && (
                                        <Text fontSize="sm" color="gray.600" mb={3}>
                                            {check.description}
                                        </Text>
                                    )}
                                    {check.value !== undefined && check.value !== null && (
                                        <Box mb={3}>
                                            <Text fontWeight="medium" fontSize="sm" mb={1}>
                                                Value:
                                            </Text>
                                            {typeof check.value === 'string' &&
                                            check.value.length > 100 ? (
                                                <Code
                                                    p={2}
                                                    borderRadius="md"
                                                    display="block"
                                                    whiteSpace="pre-wrap"
                                                    wordBreak="break-all"
                                                    fontSize="xs"
                                                    maxH="150px"
                                                    overflowY="auto"
                                                >
                                                    {check.value}
                                                </Code>
                                            ) : typeof check.value === 'object' ? (
                                                <Code
                                                    p={2}
                                                    borderRadius="md"
                                                    display="block"
                                                    whiteSpace="pre-wrap"
                                                    wordBreak="break-all"
                                                    fontSize="xs"
                                                    maxH="150px"
                                                    overflowY="auto"
                                                >
                                                    {JSON.stringify(check.value, null, 2)}
                                                </Code>
                                            ) : (
                                                <Text fontSize="sm">{String(check.value)}</Text>
                                            )}
                                        </Box>
                                    )}
                                    {check.recommendation && (
                                        <Box
                                            borderLeft="3px solid"
                                            borderColor="blue.300"
                                            pl={3}
                                            py={1}
                                            bg="blue.50"
                                            borderRadius="sm"
                                        >
                                            <Text fontWeight="medium" fontSize="sm" mb={1}>
                                                Recommendation:
                                            </Text>
                                            <Text fontSize="sm">{check.recommendation}</Text>
                                        </Box>
                                    )}
                                    {check.score !== undefined && check.score !== null && (
                                        <Badge
                                            mt={2}
                                            colorScheme={getScoreColor(check.score)}
                                            variant="outline"
                                        >
                                            Score: {check.score}
                                        </Badge>
                                    )}
                                </CardBody>
                            </Card>
                        ))}
                    </SimpleGrid>
                ) : (
                    <Card variant="outline" p={5} textAlign="center" bg="background.100">
                        <Text color="gray.600">
                            {analysisStatus === 'completed'
                                ? 'No specific checks were recorded for this analysis.'
                                : `Analysis is ${analysisStatus.toLowerCase()}. Check details will appear here once available.`}
                        </Text>
                    </Card>
                )}
            </VStack>
        </Container>
    );
};

export default Report;
