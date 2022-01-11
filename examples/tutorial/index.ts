import * as awsx from "@pulumi/awsx"
import * as eks from "@pulumi/eks"
import * as k8s from "@pulumi/kubernetes"
import * as pulumi from "@pulumi/pulumi"
import * as tezos from "@oxheadalpha/tezos-pulumi"

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
    subnets: [
      // Tag subnets for specific load-balancer usage.
      // Any non-null tag value is valid.
      // See:
      //  - https://docs.aws.amazon.com/eks/latest/userguide/network_reqs.html
      //  - https://github.com/pulumi/pulumi-eks/issues/196
      //  - https://github.com/pulumi/pulumi-eks/issues/415
      { type: "public", tags: { "kubernetes.io/role/elb": "1" } },
      { type: "private", tags: { "kubernetes.io/role/internal-elb": "1" } },
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
export const vpcId = vpc.id
export const vpcPublicSubnetIds = vpc.publicSubnetIds
export const vpcPrivateSubnetIds = vpc.privateSubnetIds

/** Create the EKS cluster. The cluster will be created in the new vpc. The
 * autoscaling group will spin up 2 cluster nodes where they will be distributed
 * across our 2 private subnets. Each subnet is in 1 of 2 vpc zones.
 */
const cluster = new eks.Cluster(projectStack, {
  vpcId: vpc.id,
  publicSubnetIds: vpc.publicSubnetIds,
  privateSubnetIds: vpc.privateSubnetIds,
  // At time of writing we found this instance type to be adequate
  instanceType: "t3.large",
  minSize: 0,
  maxSize: 2,
  desiredCapacity: 2,
})

/** Stack outputs: https://www.pulumi.com/learn/building-with-pulumi/stack-outputs/ */
export const clusterName = cluster.eksCluster.name
export const clusterId = cluster.eksCluster.id
export const clusterVersion = cluster.eksCluster.version
export const clusterStatus = cluster.eksCluster.status
export const kubeconfig = pulumi.secret(cluster.kubeconfig)

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
  { provider: cluster.provider }
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


/**
 * The following `rpcIngress` sets the `dependsOn` property the `albController`.
 * What this does is set an explicit dependency of this component on the
 * `albController`. This is because pulumi has no way of knowing that it's
 * dependent on the controller to have load balancers created. The controller is
 * a k8s resource, not a pulumi resource. The ingress will wait for
 * the controller to be fully ready. Without waiting, pulumi may error due to
 * the ingress not resolving right away.
 *
 * Being that pulumi is not in control of what the controller is doing, it is
 * highly recommended to destroy your deployment in 2 stages. The first is to
 * tear down the ingress and service. This will allow the controller to delete
 * all of the backing AWS resources. Then to destory the rest of the cluster and
 * remaining pulumi resources. Otherwise, some AWS resources may be orphaned as
 * there may be a race condition of the controller being deleted and it deleting
 * the AWS resources.
 */


/** Create the P2P service to expose your node's P2P endpoint. The alb
 * controller will create a network load balancer. The service selects by default all pods
 * with label "appType=tezos-node". tezos-k8s creates Tezos node pods by default
 * with this label. */
// const p2pService = new tezos.aws.P2PService(
//   "p2p-service",
//   { metadata: { name: "p2p-service", namespace } },
//   {
//     provider: cluster.provider,
//     dependsOn: albController.chart.ready,
//     parent: mainnetNamespace,
//   }
// )

// const rpcDomain = `rpc.${namespace}.aryeh.${oxheadHostedZoneName}`
// const rpcCert = new aws.acm.Certificate(rpcDomain, {
//   validationMethod: "DNS",
//   domainName: rpcDomain,
// })

// const rpcCertValidationRecord = new aws.route53.Record(
//   `${rpcDomain}-certValidation`,
//   {
//     name: rpcCert.domainValidationOptions[0].resourceRecordName,
//     records: [rpcCert.domainValidationOptions[0].resourceRecordValue],
//     ttl: 300,
//     type: rpcCert.domainValidationOptions[0].resourceRecordType,
//     zoneId: oxheadZone.id,
//   }
// )

// const certValidation = new aws.acm.CertificateValidation(rpcDomain, {
//   certificateArn: rpcCert.arn,
//   validationRecordFqdns: [rpcCertValidationRecord.fqdn],
// })

// Wait for all resources of both charts to be ready
// const ingressDependencies = pulumi
//   .all([albController.chart.ready, externalDns.chart.ready])
//   .apply(([a, b]) => [...a, ...b])

// const rpcIngress = new tezos.aws.RpcIngress(
//   rpcDomain,
//   {
//     metadata: {
//       name: rpcDomain,
//       namespace,
//     },
//     host: rpcDomain,
//     tls: [
//       {
//         hosts: rpcCert.domainValidationOptions.apply((dvos) =>
//           dvos.map((dvo) => dvo.domainName)
//         ),
//       },
//     ],
//     skipAwait: false,
//   },
//   { provider: cluster.provider, dependsOn: ingressDependencies }
// )

// const rpcIngress = new tezos.aws.RpcIngress(
//   "",
//   {
//     metadata: {
//       name: rpcDomain,
//       namespace,
//     },
//   },
//   { provider: cluster.provider, dependsOn: albController }
// )
// export const rpcIngressOutput: any = rpcIngress.ingress.status.loadBalancer

// // const p2pDomain = `${namespace}.aryeh.${oxheadHostedZoneName}`
// const p2pService = new tezos.aws.P2PService(
//   "",
//   {
//     skipAwait: false,
//     metadata: { name: `${namespace}-p2p-svc`, namespace },
//     spec: { selector: { peer_node: "true" } },
//   },
//   { provider: cluster.provider, dependsOn: albController }
// )
// export const p2pServiceOutput: any = p2pService.service.status.loadBalancer

// TWO STAGE TEARDOWN
// Check that timeout for webhook can be configured

// N/A GIVE EXTERNAL DNS AND ALB CONTROLLER MORE TIME ON DELETE
//
