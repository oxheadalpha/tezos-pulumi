/**
 * https://github.com/piotrwitek/utility-types/blob/df2502ef504c4ba8bd9de81a45baef112b7921d0/src/mapped-types.ts#L599-L618
 *
 * Required
 * @desc From `T` make a set of properties by key `K` become required
 * @example
 *    type Props = {
 *      name?: string;
 *      age?: number;
 *      visible?: boolean;
 *    };
 *
 *    // Expect: { name: string; age: number; visible: boolean; }
 *    type Props = Required<Props>;
 *
 *    // Expect: { name?: string; age: number; visible: boolean; }
 *    type Props = Required<Props, 'age' | 'visible'>;
 */
export type AugmentedRequired<
  T extends object,
  K extends keyof T = keyof T
> = Omit<T, K> & Required<Pick<T, K>>

/** https://github.com/sindresorhus/type-fest/blob/main/source/merge-exclusive.d.ts */
// Helper type. Not useful on its own.
type Without<FirstType, SecondType> = {
  [KeyType in Exclude<keyof FirstType, keyof SecondType>]?: never
}
/**
Create a type that has mutually exclusive keys.
This type was inspired by [this comment](https://github.com/Microsoft/TypeScript/issues/14094#issuecomment-373782604).
This type works with a helper type, called `Without`. `Without<FirstType, SecondType>` produces a type that has only keys from `FirstType` which are not present on `SecondType` and sets the value type for these keys to `never`. This helper type is then used in `MergeExclusive` to remove keys from either `FirstType` or `SecondType`.
@example
```
import {MergeExclusive} from 'type-fest';
interface ExclusiveVariation1 {
	exclusive1: boolean;
}
interface ExclusiveVariation2 {
	exclusive2: string;
}
type ExclusiveOptions = MergeExclusive<ExclusiveVariation1, ExclusiveVariation2>;
let exclusiveOptions: ExclusiveOptions;
exclusiveOptions = {exclusive1: true};
//=> Works
exclusiveOptions = {exclusive2: 'hi'};
//=> Works
exclusiveOptions = {exclusive1: true, exclusive2: 'hi'};
//=> Error
```
@category Utilities
*/
export type MergeExclusive<FirstType, SecondType> =
  | FirstType
  | SecondType extends object
  ?
      | (Without<FirstType, SecondType> & SecondType)
      | (Without<SecondType, FirstType> & FirstType)
  : FirstType | SecondType
