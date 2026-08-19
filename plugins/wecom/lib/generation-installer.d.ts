interface GenerationHooks<T> {
    readonly name: (item: T) => string;
    readonly register: (item: T) => () => void;
    readonly activate: (item: T) => void;
}
/** Replace same-named dynamic generations without duplicate registry writes. */
export declare function createGenerationInstaller<T>(hooks: GenerationHooks<T>): (items: readonly T[]) => () => void;
export {};
