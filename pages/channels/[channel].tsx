import {
  Box,
  Button,
  Card,
  CardBody,
  CardHeader,
  Heading,
  HStack,
  SimpleGrid,
  Table,
  Tag,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tooltip,
  Tr,
  VStack,
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  Skeleton,
} from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';
import { FiArrowLeft } from 'react-icons/fi';
import moment from 'moment';
import Layout from '../../components/Layout';
import ProtectedRoute from '../../components/ProtectedRoute';
import { showToast } from '../../components/toast';
import { AllTrackingResponse } from '../api/tracking/all';
import { Release } from '../../apiUtils/database/DatabaseInterface';

const CHANNEL_COLORS: Record<string, string> = {
  production: 'blue',
  staging: 'purple',
  preview: 'orange',
};

function getChannelColor(name: string): string {
  return CHANNEL_COLORS[name] ?? 'teal';
}

function formatFileSize(bytes: number): string {
  if (!bytes || bytes === 0) return '—';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default function ChannelPage() {
  const router = useRouter();
  const { channel } = router.query as { channel: string };

  const [releases, setReleases] = useState<Release[]>([]);
  const [stats, setStats] = useState({ totalDownloads: 0, iosDownloads: 0, androidDownloads: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedRelease, setSelectedRelease] = useState<Release | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const fetchData = async () => {
    if (!channel) return;
    setIsLoading(true);
    try {
      const [releasesRes, trackingRes] = await Promise.all([
        fetch(`/api/releases?channel=${channel}`),
        fetch(`/api/tracking/all?channel=${channel}`),
      ]);

      const releasesData = await releasesRes.json();
      const trackingData = (await trackingRes.json()) as AllTrackingResponse;

      setReleases(releasesData.releases ?? []);

      const ios = trackingData.trackings.find((m) => m.platform === 'ios')?.count ?? 0;
      const android = trackingData.trackings.find((m) => m.platform === 'android')?.count ?? 0;
      setStats({ totalDownloads: ios + android, iosDownloads: ios, androidDownloads: android });
    } catch {
      console.error('Failed to fetch channel data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [channel]);

  return (
    <ProtectedRoute>
      <Layout>
        <VStack align="stretch" spacing={6}>
          <HStack spacing={3}>
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<FiArrowLeft />}
              onClick={() => router.push('/dashboard')}>
              Channels
            </Button>
            <Text color="gray.400">/</Text>
            <Tag colorScheme={getChannelColor(channel)} size="lg" fontWeight="bold">
              {channel}
            </Tag>
          </HStack>

          {isLoading ? (
            <SimpleGrid columns={3} spacing={4}>
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} height="100px" borderRadius="md" />
              ))}
            </SimpleGrid>
          ) : (
            <SimpleGrid columns={3} spacing={4}>
              <Card variant="outline">
                <CardHeader pb={1}>
                  <Text fontSize="sm" color="gray.500">
                    Total Releases
                  </Text>
                </CardHeader>
                <CardBody pt={0}>
                  <Heading size="lg">{releases.length}</Heading>
                </CardBody>
              </Card>
              <Card variant="outline">
                <CardHeader pb={1}>
                  <Text fontSize="sm" color="gray.500">
                    iOS Downloads
                  </Text>
                </CardHeader>
                <CardBody pt={0}>
                  <Heading size="lg">{stats.iosDownloads}</Heading>
                </CardBody>
              </Card>
              <Card variant="outline">
                <CardHeader pb={1}>
                  <Text fontSize="sm" color="gray.500">
                    Android Downloads
                  </Text>
                </CardHeader>
                <CardBody pt={0}>
                  <Heading size="lg">{stats.androidDownloads}</Heading>
                </CardBody>
              </Card>
            </SimpleGrid>
          )}

          <Box>
            <Heading size="md" mb={4}>
              Releases
            </Heading>

            {isLoading ? (
              <Skeleton height="200px" borderRadius="md" />
            ) : releases.length === 0 ? (
              <Text color="gray.500">No releases in this channel yet.</Text>
            ) : (
              <Table variant="simple">
                <Thead>
                  <Tr>
                    <Th>Commit</Th>
                    <Th>Runtime Version</Th>
                    <Th>Timestamp (UTC)</Th>
                    <Th>Size</Th>
                    <Th>Actions</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {releases.map((release, index) => (
                    <Tr key={index}>
                      <Td>
                        <VStack align="start" spacing={0}>
                          <Tooltip label={release.commitMessage}>
                            <Text fontSize="sm" fontWeight="medium" isTruncated maxW="14rem">
                              {release.commitMessage ?? '—'}
                            </Text>
                          </Tooltip>
                          <Text fontSize="xs" color="gray.400" fontFamily="mono">
                            {release.commitHash?.slice(0, 7) ?? '—'}
                          </Text>
                        </VStack>
                      </Td>
                      <Td>
                        <Tag size="sm" colorScheme="gray">
                          v{release.runtimeVersion}
                        </Tag>
                      </Td>
                      <Td>{moment(release.timestamp).utc().format('MMM Do, HH:mm')}</Td>
                      <Td>{formatFileSize((release as any).size)}</Td>
                      <Td>
                        {index === 0 ? (
                          <Tag colorScheme={getChannelColor(channel)} size="md">
                            Active
                          </Tag>
                        ) : (
                          <Button
                            size="sm"
                            colorScheme="orange"
                            variant="outline"
                            onClick={() => {
                              setSelectedRelease(release);
                              setIsOpen(true);
                            }}>
                            Rollback
                          </Button>
                        )}
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )}
          </Box>
        </VStack>

        <AlertDialog
          isOpen={isOpen}
          leastDestructiveRef={cancelRef}
          onClose={() => setIsOpen(false)}
          isCentered>
          <AlertDialogOverlay>
            <AlertDialogContent>
              <AlertDialogHeader fontSize="lg" fontWeight="bold">
                Rollback Release
              </AlertDialogHeader>
              <AlertDialogBody>
                <Text mb={3}>Are you sure you want to rollback to this release?</Text>
                <Tag colorScheme="gray" padding={3} w="full">
                  <Text fontSize="sm" fontFamily="mono">
                    {selectedRelease?.commitHash?.slice(0, 7)} — {selectedRelease?.commitMessage}
                  </Text>
                </Tag>
                <Tag colorScheme="orange" mt={3} padding={3}>
                  <Text fontSize="sm">
                    This will promote this release to be the active release with a new timestamp.
                  </Text>
                </Tag>
              </AlertDialogBody>
              <AlertDialogFooter>
                <Button ref={cancelRef} onClick={() => setIsOpen(false)}>
                  Cancel
                </Button>
                <Button
                  colorScheme="red"
                  ml={3}
                  onClick={async () => {
                    try {
                      const response = await fetch('/api/rollback', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          path: selectedRelease?.path,
                          runtimeVersion: selectedRelease?.runtimeVersion,
                          channel: selectedRelease?.channel ?? 'production',
                          commitHash: selectedRelease?.commitHash,
                          commitMessage: selectedRelease?.commitMessage,
                        }),
                      });
                      if (!response.ok) throw new Error('Rollback failed');
                      showToast('Rollback successful', 'success');
                      fetchData();
                    } catch {
                      showToast('Rollback failed', 'error');
                    } finally {
                      setIsOpen(false);
                    }
                  }}>
                  Rollback
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialogOverlay>
        </AlertDialog>
      </Layout>
    </ProtectedRoute>
  );
}
