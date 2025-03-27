import { useState, useContext, useEffect } from 'react';
import {
    Box,
    Button,
    FormControl,
    FormLabel,
    Input,
    VStack,
    Heading,
    Text,
    useToast,
    Container,
    Card,
    CardBody,
    SimpleGrid,
    Stack,
    Badge,
    Link,
    List,
    ListItem,
    ListIcon,
    Spinner,
    Alert,
    AlertIcon,
    Divider,
    Flex,
    Spacer
} from '@chakra-ui/react';
import { MdCheckCircle, MdLink, MdDateRange } from 'react-icons/md'; // Example icons
import { API_URL, UserContext } from './App';
import { Link as RouterLink } from 'react-router-dom'; // If linking to internal report pages

const Profile = () => {
    const { user, setUser } = useContext(UserContext);
    const toast = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const [reports, setReports] = useState([]);
    const [reportsLoading, setReportsLoading] = useState(true);
    const [reportsError, setReportsError] = useState(null);

    // Fetch report history when component mounts or user changes
    useEffect(() => {
        const fetchReports = async () => {
            if (!user) return; // Don't fetch if user isn't loaded

            setReportsLoading(true);
            setReportsError(null);
            try {
                const token = localStorage.getItem('token');
                const response = await fetch(`${API_URL}/api/reports/history`, {
                    // Assuming this endpoint exists
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                });
                if (!response.ok) {
                    throw new Error('Failed to fetch report history');
                }
                const data = await response.json();
                setReports(data);
            } catch (error) {
                console.error('Error fetching report history:', error);
                setReportsError(error.message || 'Could not load reports.');
            } finally {
                setReportsLoading(false);
            }
        };

        fetchReports();
    }, [user]); // Re-fetch if user context changes

    const handleBasicChange = (field, value) => {
        setUser((prev) => ({
            ...prev,
            [field]: value
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            const response = await fetch(API_URL + '/api/profile', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({
                    firstName: user?.firstName,
                    lastName: user?.lastName
                    // Only send relevant fields
                })
            });
            const data = await response.json();
            if (response.ok) {
                toast({
                    title: 'Success',
                    description: 'Profile updated successfully',
                    status: 'success',
                    duration: 3000,
                    isClosable: true
                });
                setUser((prev) => ({ ...prev, ...data })); // Update user context with potentially updated data from backend
            } else {
                throw new Error(data.message || 'Error updating profile');
            }
        } catch (error) {
            toast({
                title: 'Error',
                description: error.message || 'Error updating profile',
                status: 'error',
                duration: 5000,
                isClosable: true
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Container maxW="container.lg" py={8}>
            <Card shadow="md" borderWidth="1px">
                <CardBody>
                    <VStack spacing={8} align="stretch">
                        {/* Subscription Section */}
                        <Box>
                            <Flex justify="space-between" align="center" mb={4}>
                                <Heading size="md">Subscription</Heading>
                                <Badge
                                    fontSize="md"
                                    px={3}
                                    py={1}
                                    borderRadius="full"
                                    colorScheme={
                                        user?.subscriptionStatus === 'active' ||
                                        user?.subscriptionStatus === 'trialing'
                                            ? 'green'
                                            : 'gray'
                                    }
                                >
                                    {user?.subscriptionStatus === 'active' ||
                                    user?.subscriptionStatus === 'trialing'
                                        ? 'Premium'
                                        : 'Free'}
                                </Badge>
                            </Flex>
                            {!(
                                user?.subscriptionStatus === 'active' ||
                                user?.subscriptionStatus === 'trialing'
                            ) ? (
                                <Link href="https://buy.stripe.com/00gdSPetHeEfgUg9AI" isExternal>
                                    <Button disabled={!user} colorScheme="orange" size="sm">
                                        Upgrade to Premium ($7.99/mo)
                                    </Button>
                                </Link>
                            ) : (
                                <Link
                                    href={
                                        'https://billing.stripe.com/p/login/9AQ8zd8ZL79E51e000?prefilled_email=' +
                                        user?.email
                                    }
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    <Button colorScheme="purple" size="sm">
                                        Manage Billing
                                    </Button>
                                </Link>
                            )}
                        </Box>

                        <Divider />

                        {/* Profile Update Form */}
                        <form onSubmit={handleSubmit}>
                            <VStack spacing={6} align="stretch">
                                <Heading size="md">Profile Information</Heading>
                                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                                    <FormControl>
                                        <FormLabel>First Name</FormLabel>
                                        <Input
                                            value={user?.firstName || ''}
                                            onChange={(e) =>
                                                handleBasicChange('firstName', e.target.value)
                                            }
                                            placeholder="Enter your first name"
                                        />
                                    </FormControl>
                                    <FormControl>
                                        <FormLabel>Last Name</FormLabel>
                                        <Input
                                            value={user?.lastName || ''}
                                            onChange={(e) =>
                                                handleBasicChange('lastName', e.target.value)
                                            }
                                            placeholder="Enter your last name"
                                        />
                                    </FormControl>
                                </SimpleGrid>
                                <FormControl>
                                    <FormLabel>Email</FormLabel>
                                    <Input value={user?.email || ''} isReadOnly disabled />
                                </FormControl>
                                <Button
                                    type="submit"
                                    colorScheme="blue"
                                    isLoading={isLoading}
                                    alignSelf="flex-start"
                                >
                                    Save Changes
                                </Button>
                            </VStack>
                        </form>

                        <Divider />

                        {/* Report History Section */}
                        <VStack spacing={4} align="stretch">
                            <Heading size="md">Analysis History</Heading>
                            {reportsLoading ? (
                                <Flex justify="center" align="center" minH="100px">
                                    <Spinner size="lg" />
                                </Flex>
                            ) : reportsError ? (
                                <Alert status="error">
                                    <AlertIcon />
                                    {reportsError}
                                </Alert>
                            ) : reports.length > 0 ? (
                                <List spacing={3}>
                                    {reports.map((report) => (
                                        <ListItem
                                            key={report._id}
                                            p={3}
                                            borderWidth="1px"
                                            borderRadius="md"
                                            _hover={{ bg: 'gray.50' }}
                                        >
                                            <Flex align="center" wrap="wrap">
                                                <ListIcon as={MdLink} color="blue.500" />
                                                <Text fontWeight="medium" mr={2}>
                                                    {report.url || 'N/A'}
                                                </Text>
                                                <Spacer />
                                                <Flex align="center" color="gray.500" fontSize="sm">
                                                    <ListIcon as={MdDateRange} m={0} mr={1} />
                                                    <Text>
                                                        {new Date(
                                                            report.createdAt
                                                        ).toLocaleDateString()}
                                                    </Text>
                                                    {/* Optional: Link to a detailed report page */}
                                                    {/* <Button as={RouterLink} to={`/reports/${report._id}`} size="xs" ml={4}>View</Button> */}
                                                </Flex>
                                            </Flex>
                                            {/* Optional: Display a summary score or status */}
                                            {/* <Text fontSize="sm" color="gray.600" mt={1}>Score: {report.score || 'N/A'}</Text> */}
                                        </ListItem>
                                    ))}
                                </List>
                            ) : (
                                <Text color="gray.500">No analysis reports found.</Text>
                            )}
                        </VStack>
                    </VStack>
                </CardBody>
            </Card>
        </Container>
    );
};

export default Profile;