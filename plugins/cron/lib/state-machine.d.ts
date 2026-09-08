import type { CronExecutionId } from './brand.ts';
import type { CronDefinitionState, CronOccurrence, CronRuntimeState } from './types.ts';
export interface CronMachineState {
    readonly definitionState: CronDefinitionState;
    readonly runtime: CronRuntimeState;
}
export type CronMachineEvent = {
    readonly kind: 'fire';
    readonly occurrence: CronOccurrence;
    readonly executionId: CronExecutionId;
} | {
    readonly kind: 'execution_finished';
    readonly executionId: CronExecutionId;
    readonly nextExecutionId: CronExecutionId;
    readonly observedAt: string;
} | {
    readonly kind: 'approval_waiting';
    readonly executionId: CronExecutionId;
} | {
    readonly kind: 'pause';
} | {
    readonly kind: 'resume';
} | {
    readonly kind: 'delete';
};
export type CronMachineEffect = {
    readonly kind: 'begin';
    readonly executionId: CronExecutionId;
    readonly occurrence: CronOccurrence;
} | {
    readonly kind: 'coalesce';
    readonly occurrence: CronOccurrence;
} | {
    readonly kind: 'start_timer';
} | {
    readonly kind: 'stop_timer';
} | {
    readonly kind: 'destroy_timer';
};
export interface CronMachineTransition {
    readonly next: CronMachineState;
    readonly effects: readonly CronMachineEffect[];
}
/** Pure single-flight transition function. */
export declare function reduceCronRuntime(state: CronMachineState, event: CronMachineEvent): CronMachineTransition;
