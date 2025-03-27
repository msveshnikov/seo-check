import { useContext } from 'react';
import {
    Box,
    Flex,
    Text,
    IconButton,
    Button,
    Stack,
    Collapse,
    Icon,
    Link,
    Popover,
    PopoverTrigger,
    PopoverContent,
    useDisclosure,
    useColorModeValue,
    Image
} from '@chakra-ui/react';
import { HamburgerIcon, CloseIcon, ChevronDownIcon, ChevronRightIcon } from '@chakra-ui/icons';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
// Assuming logo is image.png in the public folder
// import logo from './assets/logo.png'; // Original incorrect path
import { UserContext } from './App';

export default function Navbar() {
    const { isOpen, onToggle } = useDisclosure();
    const { user, setUser } = useContext(UserContext);
    const navigate = useNavigate();
    const bgColor = useColorModeValue('white', 'gray.800');
    const borderColor = useColorModeValue('gray.200', 'gray.700');

    const handleLogout = () => {
        localStorage.removeItem('token');
        setUser(null);
        navigate('/');
    };

    const handleLogoClick = () => {
        navigate('/');
    };

    // Close mobile menu when a navigation item is clicked
    const handleNavClick = () => {
        if (isOpen) onToggle();
    };

    // Define navigation items
    const NAV_ITEMS = [
        { label: 'Docs', href: '/docs', requiresAuth: false }, // Added Docs link
        { label: 'Feedback', href: '/feedback', requiresAuth: false },
        // Conditionally add Admin link if user is logged in and is admin
        ...(user?.isAdmin ? [{ label: 'Admin', href: '/admin', requiresAuth: true }] : [])
    ];

    // Filter items based on authentication status (only relevant for Admin here)
    const filteredNavItems = NAV_ITEMS.filter((item) => !item.requiresAuth || user?.email);

    return (
        <Box position="sticky" top="0" zIndex="1000">
            <Flex
                bg={bgColor}
                color={useColorModeValue('gray.600', 'white')}
                minH="60px"
                py={{ base: 2 }}
                px={{ base: 4 }}
                borderBottom={1}
                borderStyle="solid"
                borderColor={borderColor}
                align="center"
                boxShadow="sm"
            >
                {/* Mobile Hamburger Menu */}
                <Flex
                    flex={{ base: 1, md: 'auto' }}
                    ml={{ base: -2 }}
                    display={{ base: 'flex', md: 'none' }}
                >
                    {/* Show hamburger only if there are nav items to display */}
                    {filteredNavItems.length > 0 && (
                        <IconButton
                            onClick={onToggle}
                            icon={
                                isOpen ? <CloseIcon w={3} h={3} /> : <HamburgerIcon w={5} h={5} />
                            }
                            variant="ghost"
                            aria-label="Toggle Navigation"
                        />
                    )}
                </Flex>

                {/* Logo and Desktop Navigation */}
                <Flex flex={{ base: 1 }} justify={{ base: 'center', md: 'start' }} align="center">
                    <Image
                        src="/image.png" // Updated path to public folder
                        alt="Seocheck.pro Logo" // Updated alt text
                        h="40px"
                        mr={3}
                        cursor="pointer"
                        onClick={handleLogoClick}
                    />
                    {/* Desktop Navigation Links */}
                    <Flex display={{ base: 'none', md: 'flex' }} ml={10}>
                        <DesktopNav navItems={filteredNavItems} />
                    </Flex>
                </Flex>

                {/* Authentication Buttons */}
                <Stack flex={{ base: 1, md: 0 }} justify="flex-end" direction="row" spacing={6}>
                    {user?.email ? (
                        <>
                            <Button
                                as={RouterLink}
                                to="/profile"
                                variant="ghost"
                                fontSize="sm"
                                fontWeight={400}
                                onClick={handleNavClick} // Close mobile menu on click
                            >
                                Profile
                            </Button>
                            <Button
                                onClick={() => {
                                    handleNavClick(); // Close mobile menu on click
                                    handleLogout();
                                }}
                                colorScheme="red"
                                variant="outline"
                                fontSize="sm"
                                fontWeight={600}
                            >
                                Sign Out
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button
                                as={RouterLink}
                                to="/login"
                                variant="ghost"
                                onClick={handleNavClick} // Close mobile menu on click
                            >
                                Login
                            </Button>
                            <Button
                                as={RouterLink}
                                to="/signup"
                                display={{ base: 'none', md: 'inline-flex' }}
                                fontSize="sm"
                                fontWeight={600}
                                color="white"
                                bg="#3498DB" // Specific blue color
                                onClick={handleNavClick} // Close mobile menu on click
                                _hover={{
                                    bg: '#2980B9' // Darker blue on hover
                                }}
                            >
                                Sign Up
                            </Button>
                        </>
                    )}
                </Stack>
            </Flex>

            {/* Mobile Navigation Menu */}
            {filteredNavItems.length > 0 && (
                <Collapse in={isOpen} animateOpacity>
                    {/* Pass onNavClick to close menu when item is clicked */}
                    <MobileNav navItems={filteredNavItems} onNavClick={handleNavClick} />
                </Collapse>
            )}
        </Box>
    );
}

// --- Desktop Navigation Component ---
const DesktopNav = ({ navItems }) => {
    const linkColor = useColorModeValue('gray.600', 'gray.200');
    const linkHoverColor = useColorModeValue('gray.800', 'white');
    const popoverContentBgColor = useColorModeValue('white', 'gray.800');

    return (
        <Stack direction="row" spacing={4}>
            {navItems.map((navItem) => (
                <Box key={navItem.label}>
                    <Popover trigger="hover" placement="bottom-start">
                        <PopoverTrigger>
                            <Link
                                p={2}
                                as={RouterLink}
                                to={navItem.href ?? '#'}
                                fontSize="sm"
                                fontWeight={500}
                                color={linkColor}
                                _hover={{
                                    textDecoration: 'none',
                                    color: linkHoverColor
                                }}
                            >
                                {navItem.label}
                            </Link>
                        </PopoverTrigger>
                        {/* Handles sub-navigation items if any */}
                        {navItem.children && (
                            <PopoverContent
                                border={0}
                                boxShadow="xl"
                                bg={popoverContentBgColor}
                                p={4}
                                rounded="xl"
                                minW="sm"
                            >
                                <Stack>
                                    {navItem.children.map((child) => (
                                        <DesktopSubNav key={child.label} {...child} />
                                    ))}
                                </Stack>
                            </PopoverContent>
                        )}
                    </Popover>
                </Box>
            ))}
        </Stack>
    );
};

// --- Desktop Sub-Navigation Item Component (if needed) ---
const DesktopSubNav = ({ label, href, subLabel }) => {
    return (
        <Link
            as={RouterLink}
            to={href}
            role="group"
            display="block"
            p={2}
            rounded="md"
            _hover={{ bg: useColorModeValue('blue.50', 'gray.900') }} // Highlight on hover
        >
            <Stack direction="row" align="center">
                <Box>
                    <Text
                        transition="all .3s ease"
                        _groupHover={{ color: '#3498DB' }} // Color change on hover
                        fontWeight={500}
                    >
                        {label}
                    </Text>
                    <Text fontSize="sm">{subLabel}</Text>
                </Box>
                <Flex
                    transition="all .3s ease"
                    transform="translateX(-10px)"
                    opacity={0}
                    _groupHover={{ opacity: 1, transform: 'translateX(0)' }} // Animate chevron on hover
                    justify="flex-end"
                    align="center"
                    flex={1}
                >
                    <Icon color="#3498DB" w={5} h={5} as={ChevronRightIcon} />
                </Flex>
            </Stack>
        </Link>
    );
};

// --- Mobile Navigation Component ---
const MobileNav = ({ navItems, onNavClick }) => {
    return (
        <Stack bg={useColorModeValue('white', 'gray.800')} p={4} display={{ md: 'none' }}>
            {navItems.map((navItem) => (
                // Pass onNavClick to each item
                <MobileNavItem key={navItem.label} {...navItem} onNavClick={onNavClick} />
            ))}
        </Stack>
    );
};

// --- Mobile Navigation Item Component ---
const MobileNavItem = ({ label, children, href, onNavClick }) => {
    const { isOpen, onToggle } = useDisclosure();

    // If item has children, toggle sub-menu; otherwise, trigger navigation and close main menu
    const handleClick = children ? onToggle : onNavClick;

    return (
        <Stack spacing={4} onClick={handleClick}>
            <Flex
                py={2}
                as={RouterLink}
                // Only navigate if it's a direct link (not just a toggle for children)
                to={!children ? href ?? '#' : undefined}
                justify="space-between"
                align="center"
                _hover={{
                    textDecoration: 'none'
                }}
            >
                <Text fontWeight={600} color={useColorModeValue('gray.600', 'gray.200')}>
                    {label}
                </Text>
                {/* Chevron icon for items with children */}
                {children && (
                    <Icon
                        as={ChevronDownIcon}
                        transition="all .25s ease-in-out"
                        transform={isOpen ? 'rotate(180deg)' : ''}
                        w={6}
                        h={6}
                    />
                )}
            </Flex>
            {/* Collapsible Sub-menu for children */}
            <Collapse in={isOpen} animateOpacity style={{ marginTop: '0!important' }}>
                <Stack
                    mt={2}
                    pl={4}
                    borderLeft={1}
                    borderStyle="solid"
                    borderColor={useColorModeValue('gray.200', 'gray.700')}
                    align="start"
                >
                    {children &&
                        children.map((child) => (
                            <Link
                                key={child.label}
                                py={2}
                                as={RouterLink}
                                to={child.href}
                                onClick={onNavClick} // Ensure sub-item clicks also close the main menu
                            >
                                {child.label}
                            </Link>
                        ))}
                </Stack>
            </Collapse>
        </Stack>
    );
};