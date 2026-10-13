import { useQuery } from '@tanstack/react-query';
import type { AiResult, CompanyProfile, CompanySummary, Dist, ExecutiveReading, Overview, Pattern, PeriodInfo, RiskLevel, ShockPlan, TrendsData, WhatsHappening } from '@shared/types.ts';
import { get } from './api.ts';

export const useOverview = () => useQuery({ queryKey: ['overview'], queryFn: () => get<Overview>('/overview') });
export const useCompanies = () => useQuery({ queryKey: ['companies'], queryFn: () => get<{ companies: CompanySummary[]; period: PeriodInfo }>('/companies') });
export const useCompany = (key: string) => useQuery({
  queryKey: ['company', key],
  queryFn: () => get<{ profile: CompanyProfile; period: PeriodInfo; whats: AiResult<WhatsHappening> | null; plan: AiResult<ShockPlan> | null }>(`/companies/${encodeURIComponent(key)}`),
});
export const usePatterns = () => useQuery({ queryKey: ['patterns'], queryFn: () => get<{ patterns: Pattern[]; period: PeriodInfo }>('/patterns') });
export const useTrends = () => useQuery({ queryKey: ['trends'], queryFn: () => get<TrendsData>('/trends') });
export const useFacets = () => useQuery({
  queryKey: ['facets'],
  queryFn: () => get<{ facets: Record<string, Dist[]>; companies: { key: string; name: string; level: RiskLevel; events: number }[] }>('/facets'),
  staleTime: 5 * 60_000,
});
export const useExecutive = () => useQuery({ queryKey: ['executive'], queryFn: () => get<{ result: AiResult<ExecutiveReading> | null }>('/ai/executive') });
