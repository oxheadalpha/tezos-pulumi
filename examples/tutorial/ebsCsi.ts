import * as aws from "@pulumi/aws"

/** https://docs.aws.amazon.com/eks/latest/userguide/csi-iam-role.html */
const createEbsCsiRole = ({
  clusterOidcUrl,
  clusterOidcArn,
  namespace = "kube-system",
}: any) => {
  const serviceAccountName = "ebs-csi-controller-sa"

  const csiRole = clusterOidcUrl?.apply(
    (url: string) =>
      new aws.iam.Role("ebs-csi", {
        assumeRolePolicy: {
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: {
                Federated: clusterOidcArn,
              },
              Action: "sts:AssumeRoleWithWebIdentity",
              Condition: {
                StringEquals: {
                  [`${url}:sub`]: `system:serviceaccount:${namespace}:${serviceAccountName}`,
                  [`${url}:aud`]: "sts.amazonaws.com",
                },
              },
            },
          ],
        },
      })
  )

  new aws.iam.RolePolicyAttachment("ebs-csi-pa", {
    role: csiRole,
    policyArn: "arn:aws:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicy",
  })

  return csiRole
}

export default createEbsCsiRole
