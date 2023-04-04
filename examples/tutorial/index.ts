import * as aws from "@pulumi/aws"
import * as awsx from "@pulumi/awsx"
import * as eks from "@pulumi/eks"
import * as k8s from "@pulumi/kubernetes"
import * as pulumi from "@pulumi/pulumi"
import * as tezos from "@oxheadalpha/tezos-pulumi"

import createEbsCsiRole from "./ebsCsi"

/** https://www.pulumi.com/docs/intro/concepts/project/ */
const project = pulumi.getProject()
/** https://www.pulumi.com/docs/intro/concepts/stack/ */
const stack = pulumi.getStack()

const projectStack = `${project}-${stack}`

/** Create a vpc to deploy your k8s cluster into. By default the vpc will use
 * the first 2 availability zones in the region. Public and private subnets will
 * be created in each zone. Private, for cluster nodes, and public for
 * internet-facing load balancers.
 */
const vpc = new awsx.ec2.Vpc(
  projectStack,
  {
    numberOfAvailabilityZones: 2,
    subnetSpecs: [
      // Tag subnets for specific load-balancer usage.
      // Any non-null tag value is valid.
      // See:
      //  - https://docs.aws.amazon.com/eks/latest/userguide/network_reqs.html
      //  - https://github.com/pulumi/pulumi-eks/issues/196
      //  - https://github.com/pulumi/pulumi-eks/issues/415
      { type: "Public", tags: { "kubernetes.io/role/elb": "1" } },
      { type: "Private", tags: { "kubernetes.io/role/internal-elb": "1" } },
    ],
  },
  {
    // Inform pulumi to ignore tag changes to the VPCs or subnets, so that
    // tags auto-added by AWS EKS do not get removed during future
    // refreshes and updates, as they are added outside of pulumi's management
    // and would be removed otherwise.
    // See: https://github.com/pulumi/pulumi-eks/issues/271#issuecomment-548452554
    transformations: [
      (args: any) => {
        if (["aws:ec2/vpc:Vpc", "aws:ec2/subnet:Subnet"].includes(args.type)) {
          return {
            props: args.props,
            opts: pulumi.mergeOptions(args.opts, { ignoreChanges: ["tags"] }),
          }
        }
        return
      },
    ],
  }
)

/** Stack outputs: https://www.pulumi.com/learn/building-with-pulumi/stack-outputs/ */
export const vpcId = vpc.vpcId
export const vpcPublicSubnetIds = vpc.publicSubnetIds
export const vpcPrivateSubnetIds = vpc.privateSubnetIds

/** Create the EKS cluster. The cluster will be created in the new vpc. The
 * autoscaling group will spin up 2 cluster nodes (EC2 instances) where they
 * will be distributed across our 2 private subnets. Each subnet is in 1 of 2
 * vpc zones.
 */
const cluster = new eks.Cluster(projectStack, {
  version: "1.25",
  createOidcProvider: true,
  vpcId,
  publicSubnetIds: vpc.publicSubnetIds,
  privateSubnetIds: vpc.privateSubnetIds,
  // At time of writing we found this instance type to be adequate
  instanceType: "t3.large",
  // Set `minSize` and `desiredCapacity` to 0 if you ever want to pause your
  // cluster's workload.
  minSize: 2,
  desiredCapacity: 2,
})

/** Stack outputs: https://www.pulumi.com/learn/building-with-pulumi/stack-outputs/ */
export const clusterName = cluster.eksCluster.name
export const clusterId = cluster.eksCluster.id
export const clusterVersion = cluster.eksCluster.version
export const clusterStatus = cluster.eksCluster.status
export const kubeconfig = pulumi.secret(cluster.kubeconfig)
export const clusterOidcArn = cluster.core.oidcProvider!.arn
export const clusterOidcUrl = cluster.core.oidcProvider!.url

/** https://docs.aws.amazon.com/eks/latest/userguide/ebs-csi.html */
const csiRole = createEbsCsiRole({ clusterOidcArn, clusterOidcUrl })
const ebsCsiDriverAddon = new aws.eks.Addon(
  "ebs-csi-driver",
  {
    clusterName: clusterName,
    addonName: "aws-ebs-csi-driver",
    serviceAccountRoleArn: csiRole.arn,
  },
  { parent: cluster }
)

/**
 * The default gp2 storage class on EKS doesn't allow for volumes to be
 * expanded. Create a storage class here that allows for expansion.
 *
 * https://www.jeffgeerling.com/blog/2019/expanding-k8s-pvs-eks-on-aws
 */
const gp2ExpansionStorageClass = new k8s.storage.v1.StorageClass(
  "gp2-volume-expansion",
  {
    provisioner: "kubernetes.io/aws-ebs",
    allowVolumeExpansion: true,
    parameters: {
      type: "gp2",
      fsType: "ext4",
    },
    volumeBindingMode: "WaitForFirstConsumer",
    reclaimPolicy: "Delete",
    metadata: {
      name: "gp2-volume-expansion",
    },
  },
  { provider: cluster.provider, parent: cluster }
)

/** We will use the cluster instance role as the default role to attach policies
 * to. In our tutorial, the only policy will be the alb controller policy. */
const clusterInstanceRoles = cluster.instanceRoles.apply((roles) => roles)
const defaultIamRole = clusterInstanceRoles[0]

/**
 * Deploy the AWS loadbalancer controller to manage the creation of the load
 * balancers that expose your Tezos node. An application load balancer will be
 * created for the RPC ingress. The IAM policy created for the controller is
 * attached to the default cluster node role.
 *
 *  https://github.com/kubernetes-sigs/aws-load-balancer-controller
 */
const albController = new tezos.aws.AlbIngressController(
  {
    clusterName: cluster.eksCluster.name,
    iamRole: defaultIamRole,
  },
  { provider: cluster.provider, parent: cluster }
)

const namespace = "mainnet"
/** Create the k8s namespace to deploy resources into */
const mainnetNamespace = new k8s.core.v1.Namespace(
  namespace,
  { metadata: { name: namespace } },
  { provider: cluster.provider, parent: cluster }
)

/** Deploy the tezos-k8s Helm chart into the mainnet namespace. This will create
 * the Tezos rolling node amongst other things. */
const helmChart = new tezos.TezosK8sHelmChart(
  `${namespace}-tezos-aws`,
  {
    namespace,
    // The path to a Helm values.yaml file
    valuesFiles: "./values.yaml",
    // The latest tezos-k8s version as of the time of this writing.
    version: "6.0.1",
  },
  {
    provider: cluster.provider,
    parent: mainnetNamespace,
  }
)

/** Create the RPC ingress to expose your node's RPC endpoint. The alb
 * controller will create an application load balancer. */
const rpcIngress = new tezos.aws.RpcIngress(
  `${namespace}-rpc-ingress`,
  { metadata: { name: `${namespace}-rpc-ingress`, namespace } },
  {
    provider: cluster.provider,
    dependsOn: albController.chart.ready,
    parent: mainnetNamespace,
  }
)
