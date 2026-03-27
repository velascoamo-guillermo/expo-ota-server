import {
  Box,
  Card,
  CardBody,
  CardHeader,
  Heading,
  SimpleGrid,
  Text,
  Tag,
  HStack,
  VStack,
  Divider,
  Skeleton,
} from '@chakra-ui/react';
import { FiDownload, FiPackage } from 'react-icons/fi';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';
import ProtectedRoute from '../components/ProtectedRoute';
import { ChannelSummary, ChannelsResponse } from './api/channels';
import moment from 'moment';

const CHANNEL_COLORS: Record<string, string> = {
  production: 'blue',
  staging: 'purple',
  preview: 'orange',
};

function getChannelColor(name: string): string {
  return CHANNEL_COLORS[name] ?? 'teal';
}

export default function Dashboard() {
  const router = useRouter();
  const [channels, setChannels] = useState<ChannelSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch('/api/channels')
      .then((r) => r.json())
      .then((data: ChannelsResponse) => setChannels(data.channels))
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <ProtectedRoute>
      <Layout>
        <Heading size="lg" mb={6}>
          Channels
        </Heading>

        {isLoading ? (
          <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4}>
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} height="180px" borderRadius="md" />
            ))}
          </SimpleGrid>
        ) : channels.length === 0 ? (
          <Text color="gray.500">No channels found. Publish an update to get started.</Text>
        ) : (
          <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4}>
            {channels.map((channel) => (
              <Card
                key={channel.name}
                cursor="pointer"
                _hover={{ shadow: 'md', borderColor: `${getChannelColor(channel.name)}.300` }}
                transition="all 0.15s"
                borderWidth={1}
                onClick={() => router.push(`/channels/${channel.name}`)}>
                <CardHeader pb={2}>
                  <HStack justifyContent="space-between">
                    <Tag
                      colorScheme={getChannelColor(channel.name)}
                      size="lg"
                      fontWeight="bold"
                      fontSize="md">
                      {channel.name}
                    </Tag>
                    <Text fontSize="sm" color="gray.500">
                      {channel.totalReleases} release{channel.totalReleases !== 1 ? 's' : ''}
                    </Text>
                  </HStack>
                </CardHeader>

                <Divider />

                <CardBody pt={3}>
                  <VStack align="stretch" spacing={3}>
                    <Box>
                      <Text fontSize="xs" color="gray.500" mb={1}>
                        ACTIVE RELEASE
                      </Text>
                      {channel.activeRelease ? (
                        <>
                          <Text fontSize="sm" fontWeight="medium" isTruncated>
                            {channel.activeRelease.commitMessage ?? 'No message'}
                          </Text>
                          <Text fontSize="xs" color="gray.400">
                            {channel.activeRelease.commitHash?.slice(0, 7)} ·{' '}
                            {moment(channel.activeRelease.timestamp).fromNow()}
                          </Text>
                        </>
                      ) : (
                        <Text fontSize="sm" color="gray.400">
                          No releases yet
                        </Text>
                      )}
                    </Box>

                    <HStack spacing={4}>
                      <HStack spacing={1} color="gray.600">
                        <FiDownload size={14} />
                        <Text fontSize="sm">{channel.totalDownloads} downloads</Text>
                      </HStack>
                      <HStack spacing={1} color="gray.600">
                        <FiPackage size={14} />
                        <Text fontSize="sm">v{channel.activeRelease?.runtimeVersion ?? '—'}</Text>
                      </HStack>
                    </HStack>
                  </VStack>
                </CardBody>
              </Card>
            ))}
          </SimpleGrid>
        )}
      </Layout>
    </ProtectedRoute>
  );
}
