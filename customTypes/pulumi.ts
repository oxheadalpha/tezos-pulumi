import { Input } from "@pulumi/pulumi"

/**
 * Disables Pulumi’s default await logic that waits for a Kubernetes resource to
 * become “ready” before marking the resource as having been created or updated
 * succesfully.
 *
 * Please see here for more details:
 * https://www.pulumi.com/blog/improving-kubernetes-management-with-pulumis-await-logic/
 *
 * When deploying Helm charts, `skipAwait` should not be used if you have
 * resources depending on `Outputs` from the Chart.
 */
export declare type PulumiSkipAwait = Input<boolean>
