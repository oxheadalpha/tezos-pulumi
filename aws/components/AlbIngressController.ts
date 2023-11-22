import * as aws from "@pulumi/aws"
import * as pulumi from "@pulumi/pulumi"
import * as k8s from "@pulumi/kubernetes"

import { ignoreChangesTransformation } from "../../helpers"

import { RolePolicyAttachmentArgs } from "@pulumi/aws/iam/rolePolicyAttachment"

/** Arguments for the `AlbIngressController` component */
interface AlbIngressControllerArgs {
  /**
   * K8s cluster name which is a required field of the ALB Helm chart `values`.
   */
  clusterName: pulumi.Input<string>
  /** The IAM role to attach the ALB controller policy to. This policy is
   * created by the `AlbIngressController`. */
  iamRole: RolePolicyAttachmentArgs["role"]
  /** Namespace to deploy the chart in. Defaults to `kube-system`. */
  namespace?: string
  /**
   * `values` for the ALB controller Helm chart
   * https://artifacthub.io/packages/helm/aws/aws-load-balancer-controller#configuration.
   */
  values?: pulumi.Inputs
  /** ALB controller Helm chart `version` */
  version?: string
}

/**
 * Deploy the aws-load-balancer-controller Helm chart including the necesssary
 * IAM policy.
 *
 * Chart repo:
 * https://github.com/aws/eks-charts/blob/master/stable/aws-load-balancer-controller/README.md
 *
 * Helm chart:
 * https://artifacthub.io/packages/helm/aws/aws-load-balancer-controller
 */
export default class AlbIngressController extends pulumi.ComponentResource {
  /** `args` with filled in default values */
  readonly args: AlbIngressControllerArgs
  /** The ALB controller Helm chart instance */
  readonly chart: k8s.helm.v3.Chart

  constructor(
    args: AlbIngressControllerArgs,
    opts?: pulumi.ComponentResourceOptions
  ) {
    super(
      "tezos-aws:alb-ingress-controller:AlbIngressController",
      "alb-ingress-controller",
      {},
      opts
    )

    this.args = {
      ...args,
      namespace: args.namespace || "kube-system",
      version: args.version,
      values: {
        clusterName: args.clusterName,
        replicaCount: 2,
        /** `keepTLSSecret` is broken:
         * https://github.com/kubernetes-sigs/aws-load-balancer-controller/issues/2312
         * */
        // keepTLSSecret: true,
        ...args.values,
      },
    }

    const ingressControllerPolicy = this.createPolicy()
    new aws.iam.RolePolicyAttachment(
      "alb-ingress-controller",
      {
        policyArn: ingressControllerPolicy.arn,
        role: this.args.iamRole,
      },
      { parent: this }
    )

    pulumi.log.debug(
      `aws-load-balancer-controller transformation: Will ignore changes to TLS certificate on subsequent pulumi ups.`
    )
    this.chart = new k8s.helm.v3.Chart(
      "aws-load-balancer-controller",
      {
        chart: "aws-load-balancer-controller",
        namespace: this.args.namespace,
        version: this.args.version,
        fetchOpts: {
          repo: "https://aws.github.io/eks-charts",
        },
        values: this.args.values,
      },
      {
        parent: this,
        transformations: [
          /**
           * Don't deploy any changes to the ALB controller's TLS cert. Without
           * this transformation, pulumi would cause the cert to update due to
           * pulumi running `helm template` to deploy charts. The generation
           * functions for the cert would run again.
           */
          (chartResource) => {
            if (
              chartResource.type === "kubernetes:core/v1:Secret" &&
              chartResource.name ===
                `${this.args.namespace}/aws-load-balancer-tls`
            ) {
              return ignoreChangesTransformation(chartResource, ["data"])
            } else if (
              chartResource.name === "aws-load-balancer-webhook" &&
              (chartResource.type ===
                "kubernetes:admissionregistration.k8s.io/v1:ValidatingWebhookConfiguration" ||
                chartResource.type ===
                  "kubernetes:admissionregistration.k8s.io/v1:MutatingWebhookConfiguration")
            ) {
              return ignoreChangesTransformation(chartResource, [
                "webhooks[0].clientConfig.caBundle",
                "webhooks[1].clientConfig.caBundle",
              ])
            }
            return
          },
        ],
      }
    )

    this.registerOutputs()
  }

  // https://github.com/kubernetes-sigs/aws-load-balancer-controller/blob/a92e689dfe464f5b24784f398947e0fef31dc470/docs/install/iam_policy.json
  private createPolicy() {
    return new aws.iam.Policy(
      "alb-ingress-controller",
      {
        description:
          "Gives k8s ALB ingress controller access to required resources",
        policy: {
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: ["iam:CreateServiceLinkedRole"],
              Resource: "*",
              Condition: {
                StringEquals: {
                  "iam:AWSServiceName": "elasticloadbalancing.amazonaws.com",
                },
              },
            },
            {
              Effect: "Allow",
              Action: [
                "ec2:DescribeAccountAttributes",
                "ec2:DescribeAddresses",
                "ec2:DescribeAvailabilityZones",
                "ec2:DescribeInternetGateways",
                "ec2:DescribeVpcs",
                "ec2:DescribeVpcPeeringConnections",
                "ec2:DescribeSubnets",
                "ec2:DescribeSecurityGroups",
                "ec2:DescribeInstances",
                "ec2:DescribeNetworkInterfaces",
                "ec2:DescribeTags",
                "ec2:GetCoipPoolUsage",
                "ec2:DescribeCoipPools",
                "elasticloadbalancing:DescribeLoadBalancers",
                "elasticloadbalancing:DescribeLoadBalancerAttributes",
                "elasticloadbalancing:DescribeListeners",
                "elasticloadbalancing:DescribeListenerCertificates",
                "elasticloadbalancing:DescribeSSLPolicies",
                "elasticloadbalancing:DescribeRules",
                "elasticloadbalancing:DescribeTargetGroups",
                "elasticloadbalancing:DescribeTargetGroupAttributes",
                "elasticloadbalancing:DescribeTargetHealth",
                "elasticloadbalancing:DescribeTags",
              ],
              Resource: "*",
            },
            {
              Effect: "Allow",
              Action: [
                "cognito-idp:DescribeUserPoolClient",
                "acm:ListCertificates",
                "acm:DescribeCertificate",
                "iam:ListServerCertificates",
                "iam:GetServerCertificate",
                "waf-regional:GetWebACL",
                "waf-regional:GetWebACLForResource",
                "waf-regional:AssociateWebACL",
                "waf-regional:DisassociateWebACL",
                "wafv2:GetWebACL",
                "wafv2:GetWebACLForResource",
                "wafv2:AssociateWebACL",
                "wafv2:DisassociateWebACL",
                "shield:GetSubscriptionState",
                "shield:DescribeProtection",
                "shield:CreateProtection",
                "shield:DeleteProtection",
              ],
              Resource: "*",
            },
            {
              Effect: "Allow",
              Action: [
                "ec2:AuthorizeSecurityGroupIngress",
                "ec2:RevokeSecurityGroupIngress",
              ],
              Resource: "*",
            },
            {
              Effect: "Allow",
              Action: ["ec2:CreateSecurityGroup"],
              Resource: "*",
            },
            {
              Effect: "Allow",
              Action: ["ec2:CreateTags"],
              Resource: "arn:aws:ec2:*:*:security-group/*",
              Condition: {
                StringEquals: {
                  "ec2:CreateAction": "CreateSecurityGroup",
                },
                Null: {
                  "aws:RequestTag/elbv2.k8s.aws/cluster": "false",
                },
              },
            },
            {
              Effect: "Allow",
              Action: ["ec2:CreateTags", "ec2:DeleteTags"],
              Resource: "arn:aws:ec2:*:*:security-group/*",
              Condition: {
                Null: {
                  "aws:RequestTag/elbv2.k8s.aws/cluster": "true",
                  "aws:ResourceTag/elbv2.k8s.aws/cluster": "false",
                },
              },
            },
            {
              Effect: "Allow",
              Action: [
                "ec2:AuthorizeSecurityGroupIngress",
                "ec2:RevokeSecurityGroupIngress",
                "ec2:DeleteSecurityGroup",
              ],
              Resource: "*",
              Condition: {
                Null: {
                  "aws:ResourceTag/elbv2.k8s.aws/cluster": "false",
                },
              },
            },
            {
              Effect: "Allow",
              Action: [
                "elasticloadbalancing:CreateLoadBalancer",
                "elasticloadbalancing:CreateTargetGroup",
              ],
              Resource: "*",
              Condition: {
                Null: {
                  "aws:RequestTag/elbv2.k8s.aws/cluster": "false",
                },
              },
            },
            {
              Effect: "Allow",
              Action: [
                "elasticloadbalancing:CreateListener",
                "elasticloadbalancing:DeleteListener",
                "elasticloadbalancing:CreateRule",
                "elasticloadbalancing:DeleteRule",
              ],
              Resource: "*",
            },
            {
              Effect: "Allow",
              Action: [
                "elasticloadbalancing:AddTags",
                "elasticloadbalancing:RemoveTags",
              ],
              Resource: [
                "arn:aws:elasticloadbalancing:*:*:targetgroup/*/*",
                "arn:aws:elasticloadbalancing:*:*:loadbalancer/net/*/*",
                "arn:aws:elasticloadbalancing:*:*:loadbalancer/app/*/*",
              ],
              Condition: {
                Null: {
                  "aws:RequestTag/elbv2.k8s.aws/cluster": "true",
                  "aws:ResourceTag/elbv2.k8s.aws/cluster": "false",
                },
              },
            },
            {
              Effect: "Allow",
              Action: [
                "elasticloadbalancing:AddTags",
                "elasticloadbalancing:RemoveTags",
              ],
              Resource: [
                "arn:aws:elasticloadbalancing:*:*:listener/net/*/*/*",
                "arn:aws:elasticloadbalancing:*:*:listener/app/*/*/*",
                "arn:aws:elasticloadbalancing:*:*:listener-rule/net/*/*/*",
                "arn:aws:elasticloadbalancing:*:*:listener-rule/app/*/*/*",
              ],
            },
            {
              Effect: "Allow",
              Action: [
                "elasticloadbalancing:ModifyLoadBalancerAttributes",
                "elasticloadbalancing:SetIpAddressType",
                "elasticloadbalancing:SetSecurityGroups",
                "elasticloadbalancing:SetSubnets",
                "elasticloadbalancing:DeleteLoadBalancer",
                "elasticloadbalancing:ModifyTargetGroup",
                "elasticloadbalancing:ModifyTargetGroupAttributes",
                "elasticloadbalancing:DeleteTargetGroup",
              ],
              Resource: "*",
              Condition: {
                Null: {
                  "aws:ResourceTag/elbv2.k8s.aws/cluster": "false",
                },
              },
            },
            {
              Effect: "Allow",
              Action: ["elasticloadbalancing:AddTags"],
              Resource: [
                "arn:aws:elasticloadbalancing:*:*:targetgroup/*/*",
                "arn:aws:elasticloadbalancing:*:*:loadbalancer/net/*/*",
                "arn:aws:elasticloadbalancing:*:*:loadbalancer/app/*/*",
              ],
              Condition: {
                StringEquals: {
                  "elasticloadbalancing:CreateAction": [
                    "CreateTargetGroup",
                    "CreateLoadBalancer",
                  ],
                },
                Null: {
                  "aws:RequestTag/elbv2.k8s.aws/cluster": "false",
                },
              },
            },
            {
              Effect: "Allow",
              Action: [
                "elasticloadbalancing:RegisterTargets",
                "elasticloadbalancing:DeregisterTargets",
              ],
              Resource: "arn:aws:elasticloadbalancing:*:*:targetgroup/*/*",
            },
            {
              Effect: "Allow",
              Action: [
                "elasticloadbalancing:SetWebAcl",
                "elasticloadbalancing:ModifyListener",
                "elasticloadbalancing:AddListenerCertificates",
                "elasticloadbalancing:RemoveListenerCertificates",
                "elasticloadbalancing:ModifyRule",
              ],
              Resource: "*",
            },
          ],
        },
      },
      { parent: this }
    )
  }
}
