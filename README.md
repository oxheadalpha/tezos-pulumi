# Tezos Pulumi

`tezos-pulumi` is a [Pulumi Typescript](https://www.pulumi.com/docs/intro/languages/javascript/) node module for deploying Tezos infrastructure on AWS using Kubernetes. The library provides various components and helpers to simplify the process of deploying Tezos nodes, baking infrastructure, and related services. It is designed to work in conjunction with Oxhead Alpha's [tezos-k8s](https://github.com/oxheadalpha/tezos-k8s) project for managing Tezos infrastructure on Kubernetes. You can find the `tezos-k8s` documentation [here](https://tezos-k8s.xyz/).

For a step-by-step guide on how to use this library to deploy scalable Tezos nodes in AWS, please refer to our [tutorial](https://medium.com/the-aleph/deploy-scalable-tezos-nodes-in-the-cloud-bbe4f4f4ddcc) on Medium.

Also see our [baking tutorial](https://medium.com/the-aleph/deploy-tezos-baker-in-the-cloud-using-ledger-wallet-remote-signer-and-consensus-key-9ab3ce4d14cc) for deploying a baker on Mainnet using a Ledger Wallet, remote signer, and consensus key.

## Components

This library provides a set of components to help you deploy and manage Tezos infrastructure. For detailed documentation on each component, please refer to the respective TypeScript source files. You can find an example of using this library in the `examples/tutorial` directory within this repository. Below is a short description of each component:

### General Components

- `TezosK8sHelmChart`:
  Simplifies the deployment of [tezos-k8s Helm charts](https://github.com/oxheadalpha/tezos-k8s/tree/master/charts) into your Kubernetes cluster. The Helm charts can deploy various Tezos components such as RPC nodes, bakers, indexers, remote signers, and faucets.

### AWS Components

- `AlbIngressController`:
  Deploys the [AWS Load Balancer Controller](https://docs.aws.amazon.com/eks/latest/userguide/aws-load-balancer-controller.html) in your Kubernetes cluster. This controller manages the creation of AWS Application Load Balancers (ALB) for your Tezos nodes, allowing you to expose the RPC and P2P endpoints with ease.

- `ExternalDns`:
  Deploys the [external-dns](https://github.com/kubernetes-sigs/external-dns) controller in your Kubernetes cluster. This controller synchronizes exposed Kubernetes Services and Ingresses with DNS providers like Route 53, automating the management of DNS records for your Tezos infrastructure.

- `RpcIngress`:
  Creates a Kubernetes ingress resource for your Tezos nodes' RPC endpoint. With the `AlbIngressController` in place, this ingress resource results in an ALB being provisioned, exposing the RPC endpoint to the internet.

- `P2PService`:
  Creates a Kubernetes service for your Tezos nodes' P2P endpoint. The ALB controller will create a Network Load Balancer allowing other Tezos nodes to communicate with your nodes.

- `TzktIngress`:
  Creates an ingress resource for the [TzKT](https://github.com/baking-bad/tzkt) API of a deployed indexer. Similar to the `RpcIngress`, this component works with the `AlbIngressController` to expose the TzKT API via an ALB.
