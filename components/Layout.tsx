import { Box, Flex, Button, HStack, Text, FlexProps } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { FaSignOutAlt, FaLayerGroup } from 'react-icons/fa';
import { FiZap } from 'react-icons/fi';

export default function Layout({ children, ...props }: { children: React.ReactNode } & FlexProps) {
  const router = useRouter();

  const navItems = [
    { name: 'Channels', path: '/dashboard', icon: <FaLayerGroup /> },
  ];

  const handleLogout = () => {
    localStorage.removeItem('isAuthenticated');
    router.push('/');
  };

  return (
    <Box minHeight="100vh" {...props}>
      <Flex
        as="nav"
        w="full"
        px={6}
        h="64px"
        borderBottom="1px solid"
        borderColor="gray.200"
        alignItems="center"
        justifyContent="space-between"
        bg="white"
        position="sticky"
        top={0}
        zIndex={10}>
        <HStack spacing={2} cursor="pointer" onClick={() => router.push('/dashboard')}>
          <Box color="blue.500">
            <FiZap size={20} />
          </Box>
          <Text fontWeight="bold" fontSize="md" letterSpacing="tight">
            OTA Server
          </Text>
        </HStack>

        <HStack spacing={2}>
          {navItems.map((item) => (
            <Button
              key={item.path}
              size="sm"
              variant={router.pathname.startsWith(item.path) ? 'solid' : 'ghost'}
              colorScheme={router.pathname.startsWith(item.path) ? 'blue' : 'gray'}
              leftIcon={item.icon}
              onClick={() => router.push(item.path)}>
              {item.name}
            </Button>
          ))}
        </HStack>

        <Button
          size="sm"
          variant="ghost"
          colorScheme="red"
          leftIcon={<FaSignOutAlt />}
          onClick={handleLogout}>
          Logout
        </Button>
      </Flex>

      <Box p={8}>
        {children}
      </Box>
    </Box>
  );
}
