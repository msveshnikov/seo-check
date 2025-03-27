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
import { UserContext } from './App';

export default function Navbar() {
    const { isOpen, onToggle } = useDisclosure();
    const { user, setUser } = useContext(UserContext);
    const navigate = useNavigate();
    const bgColor = useColorModeValue('white', 'gray.800');
    const borderColor = useColorModeValue('gray.200', 'gray.700');
    const linkColor = useColorModeValue('gray.600', 'gray.200');
    const linkHoverColor = useColorModeValue('gray.800', 'white');

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

    // Define base public navigation items
    const baseNavItems = [
        { label: 'Docs', href: '/docs' },
        { label: 'Feedback', href: '/feedback' }
    ];

    // Conditionally add authenticated/admin items
    const authNavItems = [];
    if (user) {
        authNavItems.push({ label: 'Dashboard', href: '/dashboard' });
        if (user.isAdmin) {
            authNavItems.push({ label: 'Admin', href: '/admin' });
        }
    }

    const NAV_ITEMS = [...baseNavItems, ...authNavItems];

    return (
        <Box position="sticky" top="0" zIndex="1000" width="100%">
            <Flex
                bg={bgColor}
                color={linkColor}
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
                    <IconButton
                        onClick={onToggle}
                        icon={isOpen ? <CloseIcon w={3} h={3} /> : <HamburgerIcon w={5} h={5} />}
                        variant="ghost"
                        aria-label="Toggle Navigation"
                    />
                </Flex>

                {/* Logo and Desktop Navigation */}
                <Flex flex={{ base: 1 }} justify={{ base: 'center', md: 'start' }} align="center">
                    <Image
                        src="/image.png" // Path relative to public folder
                        alt="Seocheck.my Logo"
                        h="40px"
                        mr={3}
                        cursor="pointer"
                        onClick={handleLogoClick}
                    />
                    {/* Desktop Navigation Links */}
                    <Flex display={{ base: 'none', md: 'flex' }} ml={10}>
                        <DesktopNav navItems={NAV_ITEMS} />
                    </Flex>
                </Flex>

                {/* Authentication Buttons */}
                <Stack flex={{ base: 1, md: 0 }} justify="flex-end" direction="row" spacing={6}>
                    {user ? (
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
                                size="sm" // Consistent size
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
                                fontSize="sm"
                                fontWeight={400}
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
                                bg="primary.500" // Use theme color
                                size="sm" // Consistent size
                                onClick={handleNavClick} // Close mobile menu on click
                                _hover={{
                                    bg: 'secondary.500' // Use theme color
                                }}
                            >
                                Sign Up
                            </Button>
                        </>
                    )}
                </Stack>
            </Flex>

            {/* Mobile Navigation Menu */}
            <Collapse in={isOpen} animateOpacity>
                {/* Pass onNavClick to close menu when item is clicked */}
                <MobileNav navItems={NAV_ITEMS} onNavClick={handleNavClick} />
            </Collapse>
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
            _hover={{ bg: useColorModeValue('primary.50', 'gray.900') }} // Use theme color tint
        >
            <Stack direction="row" align="center">
                <Box>
                    <Text
                        transition="all .3s ease"
                        _groupHover={{ color: 'primary.500' }} // Use theme color
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
                    <Icon color="primary.500" w={5} h={5} as={ChevronRightIcon} />{' '}
                    {/* Use theme color */}
                </Flex>
            </Stack>
        </Link>
    );
};

// --- Mobile Navigation Component ---
const MobileNav = ({ navItems, onNavClick }) => {
    return (
        <Stack
            bg={useColorModeValue('white', 'gray.800')}
            p={4}
            display={{ md: 'none' }}
            borderBottom="1px"
            borderColor={useColorModeValue('gray.200', 'gray.700')}
        >
            {navItems.map((navItem) => (
                // Pass onNavClick to each item
                <MobileNavItem key={navItem.label} {...navItem} onNavClick={onNavClick} />
            ))}
            {/* Note: Auth buttons (Login/Signup/Profile/Logout) are handled separately in the main Flex bar */}
            {/* This keeps them visible but might not be ideal UX. Consider integrating them here if needed. */}
        </Stack>
    );
};

// --- Mobile Navigation Item Component ---
const MobileNavItem = ({ label, children, href, onNavClick }) => {
    const { isOpen, onToggle } = useDisclosure();
    const linkColor = useColorModeValue('gray.600', 'gray.200');

    // If item has children, toggle sub-menu; otherwise, trigger navigation and close main menu
    const handleClick = (e) => {
        if (children) {
            // Prevent navigation if it's just a toggle
            e.preventDefault();
            onToggle();
        } else if (href) {
            // Allow navigation and close the main menu
            onNavClick();
            // Navigation is handled by RouterLink
        } else {
            // Fallback if no href and no children (shouldn't happen with current NAV_ITEMS)
            onNavClick();
        }
    };

    return (
        <Stack spacing={4} onClick={handleClick}>
            <Flex
                py={2}
                as={RouterLink}
                // Only set 'to' prop if it's a direct link (no children)
                to={!children ? (href ?? '#') : undefined}
                justify="space-between"
                align="center"
                _hover={{
                    textDecoration: 'none'
                }}
            >
                <Text fontWeight={600} color={linkColor}>
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
                                // Close parent toggle as well if needed, though onClick on parent Stack might handle this
                                display="block" // Ensure link takes full width for easier clicking
                                width="100%"
                            >
                                {child.label}
                            </Link>
                        ))}
                </Stack>
            </Collapse>
        </Stack>
    );
};
