import type { Roadmap } from '@/types';
import { book, docs, link, roadmapSh } from './helpers';

export const roadmap: Roadmap = {
  slug: 'devops',
  order: 4,
  title: 'DevOps Engineer',
  kind: 'role',
  icon: '🚀',
  description: 'Getting code from a laptop to production reliably: Linux, networking, containers, CI/CD, infrastructure as code, cloud, and observability.',
  roadmapShUrl: 'https://roadmap.sh/devops',
  sections: [
    {
      id: 'os',
      title: 'Operating systems and networking',
      nodes: [
        {
          id: 'linux',
          title: 'Linux fundamentals',
          description: 'Filesystem, permissions, processes, systemd, package managers, logs under /var/log. The substrate of nearly every server.',
          resources: [link('Linux Journey', 'https://linuxjourney.com/'), link('linux roadmap on roadmap.sh', 'https://roadmap.sh/linux', 'roadmap'), book('The Linux Command Line', 'https://linuxcommand.org/tlcl.php')]
        },
        {
          id: 'shell',
          title: 'Shell scripting',
          description: 'Bash: pipes, variables, loops, exit codes, set -euo pipefail, and knowing when a script should become a real program.',
          resources: [docs('Bash reference manual', 'https://www.gnu.org/software/bash/manual/'), link('ShellCheck', 'https://www.shellcheck.net/')]
        },
        {
          id: 'networking',
          title: 'Networking',
          description: 'TCP vs UDP, ports, DNS, TLS, HTTP, load balancers, firewalls - and reading a packet capture when it all goes wrong.',
          resources: [link('Cloudflare Learning Center', 'https://www.cloudflare.com/learning/'), docs('nginx documentation', 'https://nginx.org/en/docs/')]
        },
        {
          id: 'language',
          title: 'A programming language',
          description: 'Python or Go for tooling and automation. Reading application code is part of the job.',
          stageId: 'stage-2',
          resources: [docs('The Python Tutorial', 'https://docs.python.org/3/tutorial/'), docs('A Tour of Go', 'https://go.dev/tour/')]
        }
      ]
    },
    {
      id: 'vcs-ci',
      title: 'Version control and CI/CD',
      nodes: [
        {
          id: 'git',
          title: 'Git and GitHub/GitLab',
          description: 'Branching strategies, protected branches, pull request workflows and tagging releases.',
          stageId: 'stage-8',
          tags: ['git', 'workflow'],
          resources: [book('Pro Git', 'https://git-scm.com/book/en/v2'), link('git-github roadmap on roadmap.sh', 'https://roadmap.sh/git-github', 'roadmap')]
        },
        {
          id: 'ci',
          title: 'Continuous integration',
          description: 'Pipelines that build, test and package every commit - fast, reproducible, and blocking bad merges.',
          stageId: 'stage-8',
          tags: ['ci', 'pipelines', 'automation'],
          resources: [docs('GitHub Actions', 'https://docs.github.com/en/actions'), docs('GitLab CI/CD', 'https://docs.gitlab.com/ee/ci/')]
        },
        {
          id: 'cd',
          title: 'Continuous delivery and deployment strategies',
          description: 'Artifacts promoted through environments; rolling, blue-green and canary releases; rollback as a first-class operation.',
          stageId: 'stage-10',
          tags: ['ci-cd', 'deployment', 'blue-green', 'canary', 'rollback'],
          resources: [link('The Twelve-Factor App', 'https://12factor.net/'), docs('Argo Rollouts', 'https://argo-rollouts.readthedocs.io/en/stable/')]
        }
      ]
    },
    {
      id: 'containers',
      title: 'Containers and orchestration',
      nodes: [
        {
          id: 'docker',
          title: 'Docker',
          description: 'Images, layers, Dockerfiles, volumes, networks and compose. Reproducible environments from laptop to production.',
          resources: [docs('Docker - Get started', 'https://docs.docker.com/get-started/'), docs('Dockerfile best practices', 'https://docs.docker.com/build/building/best-practices/'), link('docker roadmap on roadmap.sh', 'https://roadmap.sh/docker', 'roadmap')]
        },
        {
          id: 'kubernetes',
          title: 'Kubernetes',
          description: 'Pods, deployments, services, ingress, config maps and secrets: declaring the desired state and letting the cluster converge.',
          resources: [docs('Kubernetes concepts', 'https://kubernetes.io/docs/concepts/'), docs('Kubernetes tutorials', 'https://kubernetes.io/docs/tutorials/'), link('kubernetes roadmap on roadmap.sh', 'https://roadmap.sh/kubernetes', 'roadmap')]
        },
        {
          id: 'helm-gitops',
          title: 'Helm and GitOps',
          description: 'Packaging Kubernetes manifests, and driving cluster state from a Git repository with Argo CD or Flux.',
          optional: true,
          resources: [docs('Helm', 'https://helm.sh/docs/'), docs('Argo CD', 'https://argo-cd.readthedocs.io/en/stable/'), docs('Flux', 'https://fluxcd.io/flux/')]
        }
      ]
    },
    {
      id: 'iac',
      title: 'Infrastructure as code',
      nodes: [
        {
          id: 'terraform',
          title: 'Terraform / OpenTofu',
          description: 'Declaring cloud resources in code, planning changes before applying them, and keeping state safely.',
          resources: [docs('Terraform docs', 'https://developer.hashicorp.com/terraform/docs'), docs('OpenTofu', 'https://opentofu.org/docs/'), link('terraform roadmap on roadmap.sh', 'https://roadmap.sh/terraform', 'roadmap')]
        },
        {
          id: 'config-management',
          title: 'Configuration management',
          description: 'Ansible for configuring machines idempotently; less central in a container world, still everywhere in practice.',
          optional: true,
          resources: [docs('Ansible documentation', 'https://docs.ansible.com/')]
        },
        {
          id: 'secrets',
          title: 'Secrets management',
          description: 'Vault, cloud secret managers, sealed secrets: never in the repo, rotated, and audited.',
          stageId: 'stage-10',
          tags: ['secrets', 'secrets-scanning'],
          resources: [docs('HashiCorp Vault', 'https://developer.hashicorp.com/vault/docs'), docs('Secret scanning (GitHub)', 'https://docs.github.com/en/code-security/secret-scanning')]
        }
      ]
    },
    {
      id: 'cloud',
      title: 'Cloud',
      description: 'Pick one provider and learn its compute, storage, networking, IAM and managed database services. The others map almost one-to-one.',
      nodes: [
        {
          id: 'aws',
          title: 'AWS',
          description: 'EC2, S3, VPC, IAM, RDS, Lambda, ECS/EKS, CloudWatch.',
          resources: [docs('AWS documentation', 'https://docs.aws.amazon.com/'), link('aws roadmap on roadmap.sh', 'https://roadmap.sh/aws', 'roadmap'), link('AWS Builders Library', 'https://aws.amazon.com/builders-library/')]
        },
        {
          id: 'gcp-azure',
          title: 'Google Cloud or Azure',
          description: 'The same building blocks with different names.',
          optional: true,
          resources: [docs('Google Cloud docs', 'https://cloud.google.com/docs'), docs('Azure docs', 'https://learn.microsoft.com/en-us/azure/')]
        },
        {
          id: 'serverless',
          title: 'Serverless',
          description: 'Functions, managed queues and edge runtimes: no servers to patch, different constraints to design around.',
          optional: true,
          resources: [docs('AWS Lambda', 'https://docs.aws.amazon.com/lambda/latest/dg/welcome.html'), docs('Cloudflare Workers', 'https://developers.cloudflare.com/workers/')]
        }
      ]
    },
    {
      id: 'observe',
      title: 'Observability and reliability',
      nodes: [
        {
          id: 'monitoring',
          title: 'Metrics and monitoring',
          description: 'Prometheus and Grafana: the four golden signals, percentiles, dashboards that answer questions.',
          stageId: 'stage-10',
          tags: ['metrics', 'percentiles', 'alerting'],
          resources: [docs('Prometheus overview', 'https://prometheus.io/docs/introduction/overview/'), docs('Grafana docs', 'https://grafana.com/docs/grafana/latest/')]
        },
        {
          id: 'logging-tracing',
          title: 'Logging and tracing',
          description: 'Centralised structured logs and distributed traces with OpenTelemetry.',
          stageId: 'stage-10',
          tags: ['structured-logging', 'observability'],
          resources: [docs('OpenTelemetry', 'https://opentelemetry.io/docs/'), docs('Grafana Loki', 'https://grafana.com/docs/loki/latest/')]
        },
        {
          id: 'sre',
          title: 'SRE practices',
          description: 'SLIs, SLOs and error budgets; on-call, incident response and blameless postmortems.',
          stageId: 'stage-10',
          tags: ['on-call', 'incident-response', 'postmortem'],
          resources: [book('Google SRE book', 'https://sre.google/sre-book/table-of-contents/'), book('The SRE Workbook', 'https://sre.google/workbook/table-of-contents/')]
        },
        {
          id: 'devops-more',
          title: 'Keep going',
          description: 'Service meshes, cost management, platform engineering - and the full community roadmap.',
          resources: [roadmapSh('devops'), link('DevOps Roadmap on roadmap.sh - beginner guide', 'https://roadmap.sh/devops?r=devops-beginner', 'roadmap')]
        }
      ]
    }
  ]
};
