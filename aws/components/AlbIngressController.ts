import * as aws from "@pulumi/aws"
import * as pulumi from "@pulumi/pulumi"
import * as k8s from "@pulumi/kubernetes"

import { ignoreChangesTransformation } from "helpers"

/**
ALB ingresses need to set their `dependsOn` field to `awsALBController`. This is
bec on cluster creation, there is apparently a race condition between the alb
controller pods being in a Running state and the ingresses being created. The
ingresses will fail to be created if the pods are not in "Running" state.
*/

interface AlbIngressControllerArgs {
  /** The IAM role to attach the alb-ingress-controller policy to */
  iamRole: aws.iam.Role
  /**
   * Options for the alb controller Helm chart
   * https://artifacthub.io/packages/helm/aws/aws-load-balancer-controller#configuration).
   * Setting chart `values` here will override any other other chart values that
   * are configurable fields of AlbIngressControllerArgs. Such as `clusterName`.
   */
  values?: pulumi.Inputs
  /** Helm chart version */
  version?: string
  /** The name of the cluster. This is required by the alb controller chart */
  clusterName: string
  /** Namespace to deploy the chart in */
  namespace?: string

  // skipAwait?: boolean
}

export default class AlbIngressController extends pulumi.ComponentResource {
  readonly args: AlbIngressControllerArgs

  constructor(
    args: AlbIngressControllerArgs,
    opts: pulumi.ComponentResourceOptions
  ) {
    super(
      "tezos-aws:alb-ingress-controller:AlbIngressController",
      "alb-ingress-controller",
      {},
      opts
    )
    this.args = args

    const ingressControllerPolicy = this.createPolicy()
    new aws.iam.RolePolicyAttachment(
      "alb-ingress-controller",
      {
        policyArn: ingressControllerPolicy.arn,
        role: args.iamRole,
      },
      { parent: this }
    )

    pulumi.log.info(
      `aws-load-balancer-controller transformation: Will ignore changes to TLS certificate on subsequent pulumi ups.`
    )
    new k8s.helm.v3.Chart(
      "alb-ingress-controller",
      {
        chart: "aws-load-balancer-controller",
        namespace: args.namespace || "kube-system",
        version: args.version || "1.2.7",
        fetchOpts: {
          repo: "https://aws.github.io/eks-charts",
        },
        values: {
          clusterName: args.clusterName,
          replicaCount: 2,
          // livenessProbe: {
          //   // So pulumi doesn't error while
          //   timeoutSeconds: 50,
          //   failureThreshold: 4
          // },
          ...args.values,
        },
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
              chartResource.name === `${args.namespace}/aws-load-balancer-tls`
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

  private createPolicy() {
    return new aws.iam.Policy(
      "alb-ingress-controller",
      {
        policy: {
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: [
                "iam:CreateServiceLinkedRole",
                "ec2:DescribeAccountAttributes",
                "ec2:DescribeAddresses",
                "ec2:DescribeAvailabilityZones",
                "ec2:DescribeInternetGateways",
                "ec2:DescribeVpcs",
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
