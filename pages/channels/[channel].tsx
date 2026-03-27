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
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts';
import Layout from '../../components/Layout';
import ProtectedRoute from '../../components/ProtectedRoute';
import { showToast } from '../../components/toast';
import { AllTrackingResponse } from '../api/tracking/all';
import { MAUResponse } from '../api/tracking/mau';
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
  const [mauStats, setMauStats] = useState<{ month: string; ios: number; android: number }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedRelease, setSelectedRelease] = useState<Release | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const fetchData = async () => {
    if (!channel) return;
    setIsLoading(true);
    try {
      const [releasesRes, trackingRes, mauRes] = await Promise.all([
        fetch(`/api/releases?channel=${channel}`),
        fetch(`/api/tracking/all?channel=${channel}`),
        fetch(`/api/tracking/mau?channel=${channel}`),
      ]);

      const releasesData = await releasesRes.json();
      const trackingData = (await trackingRes.json()) as AllTrackingResponse;
      const mauData = (await mauRes.json()) as MAUResponse;

      setReleases(releasesData.releases ?? []);
      setMauStats(mauData.stats ?? []);

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
              Monthly Active Users
            </Heading>
            <Card variant="outline">
              <CardBody>
                {mauStats.length === 0 ? (
                  <Text color="gray.400" fontSize="sm" textAlign="center" py={10}>
                    No data yet. MAUs will appear once users start downloading updates.
                  </Text>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={mauStats} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="iosGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#4F46E5" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="androidGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                      <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 12 }} domain={[0, 'auto']} tickCount={5} />
                      <RechartsTooltip contentStyle={{ fontSize: 13 }} />
                      <Area
                        type="monotone"
                        dataKey="ios"
                        name="iOS"
                        stroke="#4F46E5"
                        strokeWidth={2}
                        fill="url(#iosGradient)"
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                      <Area
                        type="monotone"
                        dataKey="android"
                        name="Android"
                        stroke="#10B981"
                        strokeWidth={2}
                        fill="url(#androidGradient)"
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardBody>
            </Card>
          </Box>

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
                    <Th>Downloads</Th>
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
                      <Td>{formatFileSize(release.size ?? 0)}</Td>
                      <Td>{release.downloadCount ?? 0}</Td>
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
