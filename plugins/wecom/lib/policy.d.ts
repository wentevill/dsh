import type { DiscoveredMethod } from './discovery.ts';
/** Risk level used to gate one discovered business operation. */
export type OperationRisk = 'read' | 'write' | 'high-risk';
/** Classify by explicit confirmation metadata and deny-biased full-path vocabulary. */
export declare function classifyOperation(method: DiscoveredMethod): OperationRisk;
/** Render a bounded, credential-redacted reason for DSH's approval service. */
export declare function approvalReason(method: DiscoveredMethod, args: unknown): string;
