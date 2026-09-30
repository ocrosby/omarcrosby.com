+++
title = "Containerization in plain language"
date = "2026-09-30T13:42:04-04:00"
draft = false
description = "A jargon-free introduction to containerization — what a container actually is, what images and registries are, why teams reach for it in the first place, how Docker Desktop and Kubernetes fit into the picture, and the failure modes it does not solve."
summary = "A jargon-free introduction to containerization — what containers, images, and registries actually are; how Docker Desktop and Kubernetes fit in; and the failure modes containers do not solve."
tags = ["containers", "docker", "kubernetes", "devops", "fundamentals"]
categories = ["Fundamentals"]
ShowToc = true

[cover]
image = "/images/og/containerization-in-plain-language.png"
hiddenInList = true
hiddenInSingle = true
+++

The first time I watched a team lose an afternoon to *"works on my machine,"* the setup was almost boring. A Python service ran locally on a developer's laptop, ran locally on the QA engineer's laptop, and then refused to start in staging with a stack trace that referenced a native library nobody on the call had ever seen. Two hours of pairing turned up the actual cause: the laptops had a specific version of `libssl` installed by Homebrew, staging had the version that shipped with the base image, and one line of Python's transitive dependency graph cared about the difference. The team's fix that day was to write down the exact library versions in a README and hope. The team's fix six months later was to package the service and its entire runtime as a single artifact that would be identical everywhere it ran.

That second fix is what containerization is for. *The single most useful question to ask about a deployment problem is: could every environment that runs this service be running the exact same bytes, or are we relying on each machine to be configured the same way by hand?* If the honest answer is "by hand," you are paying the cost of not having containers — you have just spread that cost across every environment, every onboarding, and every 3 a.m. incident where the difference between two hosts turns out to be the whole bug.

The idea itself is older than the current tooling. The Linux kernel primitives that make containers possible — [namespaces](https://man7.org/linux/man-pages/man7/namespaces.7.html) for isolating what a process can see, and [cgroups](https://man7.org/linux/man-pages/man7/cgroups.7.html) for constraining what it can consume — were added incrementally through the 2000s. FreeBSD jails predate them by a decade. Google's internal *Borg* system was running production workloads in containers years before the technology reached the wider industry ([Verma et al., *Large-scale cluster management at Google with Borg*, EuroSys 2015](https://research.google/pubs/pub43438/)). What Docker did in 2013 was package those primitives behind an interface a developer could learn in an afternoon. What Kubernetes did two years later was give teams a way to run thousands of containers across a fleet without wiring the coordination themselves. Both are consequences of the same underlying idea.

## What a container actually is

A **container** is a running process on a host operating system that has been given its own private view of the filesystem, the network, and the process tree, plus a hard cap on how much CPU and memory it is allowed to consume. From the *outside*, it is just another process on the host — you can see it with `ps`, you can kill it with `kill`. From the *inside*, it looks like a small, dedicated Linux machine with its own root filesystem, its own network interfaces, and its own set of processes.

That is the whole trick. There is no virtualized hardware, no separate operating system running underneath, no BIOS emulated. The Linux kernel is shared with the host. What differs is what the process is *allowed to see*, and that difference is enough to make an application behave as though it has the machine to itself.

Two consequences follow directly, and most of containerization's practical properties come from them:

- **Startup is fast** — measured in fractions of a second, because there is no OS to boot. Starting a container is closer to starting a program than to starting a virtual machine.
- **Isolation is thinner than a VM's** — a compromised container has a shorter path to the host kernel than a compromised VM has to the hypervisor. Containers are a strong boundary between *applications*; they are a weaker boundary between *tenants who do not trust each other*. This distinction matters, and I return to it in the limitations section.

## The vocabulary, defined without hand-waving

If you have read three introductions to Docker and are still uncertain what half the words mean, that is the fault of the introductions. Here is the working vocabulary in the order it usually comes up:

- **Image** — a read-only artifact that packages an application's code together with every runtime dependency it needs: the interpreter, the shared libraries, the system utilities, the configuration files. An image is a *template*; running it produces a container. A single image can produce any number of containers, each independent of the others. Images are typically identified by a name and a tag (`myapp:1.4.0`) and referenced by an immutable content hash (`sha256:...`).
- **Container** — a running (or stopped) instance of an image. If the image is the class, the container is the object. Containers have their own filesystem changes layered on top of the image, their own process IDs, their own network namespace, and their own resource limits.
- **Layer** — an image is not one monolithic blob; it is a stack of read-only layers, each representing a filesystem diff (add these files, remove those, modify these). Because layers are content-addressed, two images that share a base layer share it on disk and over the network — you only pull what you do not already have. This is why a second image based on `python:3.12-slim` downloads much faster than the first.
- **Dockerfile** — a text file that describes, one instruction at a time, how to build an image. `FROM python:3.12-slim` sets the base layer; `COPY . /app` adds application code as a new layer; `RUN pip install -r requirements.txt` produces another. The file is a *recipe*, and its output is deterministic to the extent that its inputs are pinned.
- **Registry** — a server that stores and serves images. [Docker Hub](https://hub.docker.com/) is the public default; every cloud provider runs a private one (Amazon ECR, Google Artifact Registry, Azure Container Registry); teams commonly run their own for internal images. `docker push` uploads to a registry; `docker pull` downloads from one.
- **Tag** — a mutable, human-friendly pointer at a specific image inside a registry. `myapp:latest` is a tag; so is `myapp:1.4.0`. Tags can be moved to point at different images over time, which is the source of a whole category of reproducibility bugs — see the limitations section.
- **Volume** — a place to store data that must outlive the container it belongs to. Containers are supposed to be *ephemeral* (start, do work, stop, be discarded), so anything that must survive a restart — a database's files, uploaded user content, a cache — lives in a volume mounted into the container from the host or from a network filesystem.
- **Bind mount** — the same idea as a volume but mapping a specific host path into the container. During local development, teams often bind-mount their source directory into the container so an edit in the editor is visible to the running process without rebuilding the image.
- **Networking** — by default, a container has its own network stack. Docker creates a virtual bridge on the host and connects each container to it, so containers can reach one another by name. Ports on the container can be *published* to the host (`-p 8080:8080`), which is how a web request from your browser reaches a process inside a container.
- **Docker Engine** — the daemon that runs on the host, listens on a Unix socket, and turns commands like `docker run` into actual container starts. Docker Desktop bundles it; a Linux server typically installs it as a system service.
- **OCI** — the [Open Container Initiative](https://opencontainers.org/), the standards body that specifies what an image and a runtime actually are. Because OCI is a standard, Docker is not the only implementation. Podman, containerd, CRI-O, and BuildKit all speak the same image format. An image built with any of them can be run by any of the others.
- **Orchestrator** — the software that decides *where* containers run across a fleet of hosts, *how many* copies to keep alive, *what happens* when one crashes, and how they find one another over the network. Kubernetes is the dominant orchestrator; Amazon ECS, HashiCorp Nomad, and Docker Swarm are alternatives.

Everything else in the working vocabulary is a variation on one of these ideas.

## What building and running a container actually looks like

Abstractions harden faster with concrete steps. Here is the shortest end-to-end sketch that still shows the shape.

A developer writes a small web service in Python and adds a `Dockerfile` next to it:

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["python", "app.py"]
```

They build an image from it:

```bash
docker build -t myapp:1.0 .
```

The build produces a stack of layers — one for the base image, one for the dependencies, one for the application code — and stores the result locally under the tag `myapp:1.0`. They run it:

```bash
docker run --rm -p 8080:8080 myapp:1.0
```

A container starts. From the process's point of view, it is running on a small Linux machine with Python 3.12 installed and no other software. From the host's point of view, it is one more process, its port 8080 forwarded from the host so `http://localhost:8080` reaches it.

They push the image to a registry so the rest of the team can pull the exact same bytes:

```bash
docker tag myapp:1.0 registry.example.com/myapp:1.0
docker push registry.example.com/myapp:1.0
```

Staging pulls the image and runs it with the same command. The library that broke this whole story at the top of the post is inside the image, so staging and the laptop are now running literally the same bytes. The `libssl` version is whichever one was in the `python:3.12-slim` base — identical everywhere.

That is the whole loop: define an image, build it, run it, push it, pull it, run it somewhere else. Every complication on top of that — multi-stage builds, base image hardening, secret management, CI-driven builds — is an optimization of one of those steps, not a departure from them.

## Docker Desktop, specifically

Docker itself is a Linux technology — the isolation primitives it depends on live in the Linux kernel. On Linux, the Docker Engine runs directly on the host and there is nothing else to install. On macOS and Windows, the host kernel is not Linux, so a real Linux environment has to run *somewhere* for containers to run on it.

**[Docker Desktop](https://www.docker.com/products/docker-desktop/)** is the packaging that makes this work. It ships:

- **A lightweight Linux virtual machine** (using Apple's Virtualization framework on macOS, WSL2 on Windows) where the Docker Engine actually runs.
- **A `docker` CLI on the host** that talks to that engine over a socket, so `docker run` on your Mac looks and feels the same as `docker run` on a Linux server.
- **A GUI** for inspecting containers, images, volumes, and networks — useful when a command-line output is too dense to eyeball.
- **A bundled Kubernetes cluster** you can enable with a checkbox, which spins up a single-node cluster inside that same VM. This is meant for local development; it is not what production Kubernetes looks like, but it lets you write manifests and see them apply without provisioning a real cluster.
- **Extensions** — a plugin surface for third-party tools (database GUIs, log viewers, security scanners) that live inside the Docker Desktop window.

Docker Desktop is not the only way to get containers on macOS or Windows. **[Podman Desktop](https://podman-desktop.io/)**, **[Rancher Desktop](https://rancherdesktop.io/)**, **[colima](https://github.com/abiosoft/colima)**, and **[OrbStack](https://orbstack.dev/)** all solve the same problem — provisioning a Linux VM with a container runtime inside it and exposing a CLI to the host — with different trade-offs around licensing, resource footprint, and feature scope. The important detail is that they are interchangeable at the image level: an image built by any of them will run on any of the others, because they all speak the OCI image format.

Two practical notes about Docker Desktop worth knowing before installing it:

- **The license is not free for every organization.** Docker Desktop is free for personal use, education, non-commercial open source, and companies below a size and revenue threshold; larger organizations need a paid subscription. This is why some teams standardize on Podman Desktop or Rancher Desktop instead — the underlying containers are identical, and the license is more permissive.
- **The Linux VM has finite resources** you allocate from the host. If your build starts running out of memory or your containers keep getting killed, the first thing to check is the VM's CPU and memory allocation in Docker Desktop's settings, not your Dockerfile.

## Registries, and where images actually live

Building an image on your laptop is useful. Getting that exact image onto a CI runner, a colleague's machine, a staging cluster, and a production cluster — reliably, verifiably, and without either of you having to rebuild it — is the job of a **container registry**. A registry is an HTTP service that stores images, indexes them by name and tag, and serves them to whichever machine asks. `docker push` uploads to one; `docker pull` downloads from one; every Kubernetes cluster spends a meaningful fraction of its life talking to one.

There are two registries most newcomers encounter first: Docker Hub and the GitHub Container Registry. They are worth understanding separately because they solve overlapping problems and teams typically use both, for different reasons.

### Docker Hub

**[Docker Hub](https://hub.docker.com/)** is the original public container registry, run by Docker Inc., and — because it was there first — the default `FROM` line target for a huge fraction of the world's Dockerfiles. When you write `FROM python:3.12-slim` and run `docker build`, Docker Hub is what your machine reaches out to for the image, unless you have configured a different registry explicitly.

Two things Docker Hub is used for:

- **Consuming official images.** Docker Hub hosts the [Docker Official Images](https://docs.docker.com/trusted-content/official-images/) — curated, maintained builds of common runtimes and services (`python`, `node`, `postgres`, `nginx`, `redis`, and hundreds more). These are the base layers most Dockerfiles in the world start from. The [Docker Verified Publisher](https://hub.docker.com/search?q=&image_filter=store) program adds vendor-published images (Datadog, HashiCorp, MongoDB) with a trust signal on top.
- **Publishing your own images.** A free account gets you unlimited public repositories and a small number of private ones; paid tiers add more private repos, more concurrent pulls, and organization features. A CI job in a public repository can push new images on every release; a `docker pull yourname/yourapp:1.4.0` from any machine on the internet then works.

Two things worth knowing before you rely on Docker Hub for anything load-bearing:

- **Anonymous pulls are rate-limited.** Docker Hub caps unauthenticated pulls at 100 per 6 hours per IP address, and authenticated free-tier pulls at 200 per 6 hours per user ([Docker Hub download rate limit documentation](https://docs.docker.com/docker-hub/download-rate-limit/)). This surprises teams whose CI runners share a NAT address and hit the limit halfway through a busy afternoon. The standard mitigations are: authenticate every pull, pay for a plan that raises the limit, or mirror the images you actually depend on into a private registry inside your own network.
- **A tag on Docker Hub can move.** `python:3.12-slim` today is not literally the same bytes as `python:3.12-slim` six months from now — the tag gets rebuilt whenever the base image or its patches change. This is a feature (you get security updates for free) and a footgun (your builds are not reproducible unless you pin by digest). If reproducibility matters, use `FROM python:3.12-slim@sha256:...` and lock the specific image.

### GitHub Container Registry (ghcr.io)

**[GitHub Container Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)** — served at `ghcr.io` — is GitHub's built-in registry, part of the broader [GitHub Packages](https://github.com/features/packages) offering that also stores npm, Maven, NuGet, and RubyGems artifacts. It arrived at general availability in 2021 and has become the default publish target for a lot of open-source projects whose code already lives on GitHub, because the ergonomics of "publish next to the repository that produces it" are hard to beat.

Two things GHCR is used for:

- **Publishing images alongside the source they were built from.** A GitHub Actions workflow can log in to `ghcr.io` using the automatically-provided `GITHUB_TOKEN` — no long-lived credentials to manage — and push an image whose name and permissions inherit from the repository. `ghcr.io/<owner>/<repo>:<tag>` is the canonical shape. Pull permissions can be inherited from the source repository or set explicitly, so a private repo produces private images by default.
- **Consuming images that upstream projects publish there.** Increasingly, open-source tools ship their release images to GHCR instead of (or in addition to) Docker Hub, because their maintainers already run their CI on GitHub Actions and the extra push step is nearly free.

Two things worth knowing about GHCR:

- **Free-tier limits are generous but not unlimited.** Public images are free to store and pull; private image storage and data transfer are metered against a monthly quota that varies by GitHub plan ([GitHub Packages billing documentation](https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-packages/about-billing-for-github-packages)). For most personal projects and small teams the free allotment is effectively unlimited.
- **Authentication uses GitHub credentials, not Docker Hub ones.** `docker login ghcr.io` with a personal access token or the workflow's `GITHUB_TOKEN`; the credentials are scoped to GitHub's permission model, not Docker's.

### How teams actually use them together

For most teams, the choice is not "Docker Hub *or* GHCR" — it is "which of these do we use for which purpose." A common shape:

- **Base images** (`python:3.12-slim`, `postgres:16`) come from Docker Hub, because that is where the canonical builds live. Some teams mirror these into a private registry to insulate themselves from Docker Hub's rate limits.
- **Application images built from a GitHub repository** get pushed to GHCR, because the CI credentials are already there and the images live in the same permission scope as the code.
- **Production-critical private images** commonly get pushed to a cloud-provider registry ([Amazon ECR](https://aws.amazon.com/ecr/), [Google Artifact Registry](https://cloud.google.com/artifact-registry), [Azure Container Registry](https://azure.microsoft.com/en-us/products/container-registry)) that runs inside the same network as the cluster that consumes them, because the pull is faster and does not depend on the public internet being reachable from the cluster's egress path.

None of these is a *substitute* for the others; they are different answers to slightly different distribution problems. The important skill is not picking one and being loyal to it — it is being explicit about which registry hosts which image, and why.

## Kubernetes, specifically

One container on one host is a solved problem. The interesting problems start when you have a hundred containers that need to run across ten hosts, some of them need to talk to each other, some of them need to be reachable from the internet, some of them need to keep running when a host dies, and all of them need to get updated to a new version without downtime.

**Kubernetes** — sometimes abbreviated *k8s* because there are eight letters between the *k* and the *s* — is the software teams reach for to handle that problem. It is not a container runtime; it uses one underneath ([containerd](https://containerd.io/) or [CRI-O](https://cri-o.io/), typically). What Kubernetes provides is the *orchestration* on top: the layer that decides which host runs which container, keeps the desired number of replicas alive, gives containers stable network identities, exposes them to the internet through load balancers, and rolls updates out in a way that does not take everything down at once.

It comes out of the same lineage as Google's internal Borg. The Kubernetes founders have written about it explicitly as an open-source echo of Borg-inspired ideas for the container ecosystem outside Google ([Burns et al., *Borg, Omega, and Kubernetes*, ACM Queue 2016](https://queue.acm.org/detail.cfm?id=2898444)). Its designers made a specific bet: that operators should describe *what they want* — three copies of this service, reachable at this address, upgraded in this order — and the system should figure out *how to get there*, rather than the operator running a series of imperative commands.

That bet plays out in Kubernetes' vocabulary, most of which is naming the *desired-state* objects:

- **Pod** — the smallest thing Kubernetes schedules. A pod is one or more tightly-coupled containers that share a network namespace and can share storage. The single-container pod is by far the most common shape; the multi-container pod is for the sidecar pattern (an app container plus a logging or proxy container that runs alongside it).
- **Deployment** — a declarative description of "I want N replicas of this pod running, using this image, updated using this rollout strategy." When you change the image tag in a Deployment, Kubernetes rolls the change out one pod at a time, keeping the service reachable throughout.
- **Service** — a stable virtual IP and DNS name that routes traffic to whichever pods currently match a label selector. Pods come and go; a Service gives their consumers a fixed address that does not.
- **Ingress** — the layer that receives HTTP traffic from the outside world and routes it to Services based on hostname and path. This is what turns "an internal service inside the cluster" into "a URL a customer can visit."
- **Node** — a machine (virtual or physical) that runs pods. A cluster is a set of nodes.
- **Namespace** — a logical partition inside a cluster, used to separate environments, teams, or applications. Not the same word as the Linux kernel namespace that isolates a container; Kubernetes reuses the term for a different concept.
- **kubectl** — the command-line client used to talk to a cluster's API server. `kubectl apply -f deployment.yaml` sends a desired-state document to the cluster, which then makes the world match it.
- **Helm** — a package manager on top of Kubernetes. A Helm *chart* is a bundle of Kubernetes manifests with templated values; `helm install` renders the templates and applies them. This exists because writing raw Kubernetes YAML for a real application is verbose, and Helm is one of the more common ways teams manage that verbosity.
- **Operator** — a controller you write to teach the cluster about a domain-specific concept (a `Database`, a `KafkaCluster`) so the desired-state pattern extends to your own resources.

Kubernetes runs everywhere: managed by cloud providers ([EKS](https://aws.amazon.com/eks/), [GKE](https://cloud.google.com/kubernetes-engine), [AKS](https://azure.microsoft.com/en-us/products/kubernetes-service)), self-managed on virtual machines with [kubeadm](https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/), and on a laptop through Docker Desktop, [minikube](https://minikube.sigs.k8s.io/), [kind](https://kind.sigs.k8s.io/), or [k3d](https://k3d.io/). The cluster API is the same; the operational burden of running one is not.

The relationship between Docker and Kubernetes is often confusing to newcomers, so it is worth stating plainly. **Docker builds and runs single containers on a single host. Kubernetes coordinates many containers across many hosts.** They are not competitors — they are neighbors. A team using Kubernetes in production still typically uses Docker (or a Docker-compatible tool) on developer laptops for local iteration, builds images that Kubernetes then pulls and runs. Kubernetes stopped using Docker as its runtime in 2020 ([the *dockershim* removal in v1.24](https://kubernetes.io/blog/2022/02/17/dockershim-faq/)), but that was an internal plumbing change; the images teams build with Docker still run unchanged, because both speak OCI.

## Why teams actually reach for containers

Not every team needs them. But the case for containerization compounds as three specific problems get worse. Here are the signals that push the answer toward *yes*:

1. **Environments drift.** Your local machine, your CI runner, and production are subtly different, and the difference bites you at least once a quarter. Every hour spent reproducing a bug that only appears in one of them is an hour you would not have spent if all three ran the same bytes.

2. **Onboarding takes days.** A new engineer joins and spends most of their first week getting their laptop into a state where the app will start. Instead of a fifteen-page setup document, you want a `docker compose up`.

3. **You need multiple versions of the same runtime on one machine.** One service needs Node 18, another needs Node 20, a third needs Python 3.11. Managing these with the operating system's package manager is a losing battle; containers dodge the problem entirely because each service brings its own runtime.

4. **You want isolation between services without paying for full VMs.** A VM per service is expensive in memory and startup time. Containers give you strong-enough process isolation at a fraction of the overhead — dozens of containers happily share a host that would sag under a handful of VMs.

5. **You are deploying more than one service and need them to coordinate.** Once you have three services that talk to each other, coordinating their versions, their config, and their rollout becomes real work. This is where an orchestrator earns its keep.

6. **You want your rollout strategy — canary, blue/green, rolling — expressed once instead of scripted per service.** Kubernetes and its neighbors give you these strategies as configuration, not as bespoke deployment code.

7. **Your CI needs a clean, disposable environment for every test run.** Containers are the fastest way to get one. Spin up the database, the app, and the test runner from images; run the tests; throw everything away. No shared-state contamination between runs.

## Steelmanning the alternatives

Any pattern this dominant has neighbors that make a real case for themselves. Each of them has a limit, and the honest version of the containerization conversation names both.

**"Just use a virtual machine."** VMs are a legitimate answer to "I need isolation and portability." They are stronger isolation than containers — a full guest OS with its own kernel — and they are what you should reach for when you genuinely do not trust the workload (multi-tenant hosting, running customer-supplied code, security-sensitive isolation). The failure mode is not correctness; it is cost. A VM per microservice consumes gigabytes of memory each, boots in tens of seconds, and takes a full-fat OS image to keep patched. Teams that ran services in VMs for a decade generally did not enjoy it, which is part of why containers took over so quickly for internal-services use cases where the trust boundary was already at the network edge.

**"Just use a serverless platform (AWS Lambda, Cloud Run, Fargate)."** For a lot of simple request-response services, this is exactly the right answer — no host to manage, no orchestrator to run, autoscaling to zero. The failure modes are the platform's limits: cold-start latency, execution-duration caps, per-invocation billing that gets expensive under sustained load, and constraints on what you can package. Serverless platforms often build on containers underneath ([Cloud Run](https://cloud.google.com/run) and [Fargate](https://aws.amazon.com/fargate/) both run OCI images), so knowing how to build a good image is prerequisite for using them well. Serverless is not an escape from containers; for many teams it is the way they consume them.

**"Just use Nix or Guix."** Both are legitimate answers to "I want reproducible builds and environments," and they aim at a stronger property than a Dockerfile does — a build is a pure function of its inputs, not a sequence of imperative steps whose outcome depends on when you ran them. The failure mode is adoption cost. Nix has a real learning curve, its ecosystem is smaller than Docker's, and it does not solve the orchestration problem containers eventually push you into. Teams that adopt Nix for build reproducibility often still ship the output as an OCI image — the two solve overlapping but different problems.

**"Containers are dead — we're on Wasm/unikernels/isolates now."** [WebAssembly runtimes](https://wasi.dev/) and cloud-provider isolate platforms ([Cloudflare Workers](https://workers.cloudflare.com/), [Deno Deploy](https://deno.com/deploy)) are real, credible answers to a specific slice of the workload: short-lived, sandboxed, request-scoped code with millisecond cold starts. They are not, today, a general replacement for the container-plus-orchestrator model that runs stateful services, databases, background workers, and anything requiring a POSIX filesystem. The right way to hold this is that Wasm and containers are complementary; Wasm carves out a segment where its properties matter more than containers'. The whole workload does not move.

**"We don't need any of this — we just deploy a binary to a VM with systemd."** For a single Go service on a single VM, this is not wrong. It works. Where it breaks down is at N services, or when the runtime is not a static binary, or when the operational team standardizes on a single deploy path that expects an image. Standardization has value beyond correctness — you write the deploy pipeline once, not per project. That is often the real reason teams pick up containers even when their first service does not need them.

## What containerization does NOT solve

Being honest about the boundary of a technique is what makes recommending it trustworthy. Here is what containers are not.

- **They do not fix a bad application.** A service with a memory leak in a container has a memory leak in a container. The isolation stops the leak from harming its neighbors; it does not stop the leak. Containers make bad behavior *contained*, not *cured*.
- **They are not a strong tenant isolation boundary.** Containers share a kernel with the host. A kernel-level vulnerability is a container-escape vulnerability. If you are running untrusted, third-party code, use a VM boundary ([Firecracker](https://firecracker-microvm.github.io/), [gVisor](https://gvisor.dev/), or straightforward hypervisors) or a stronger sandbox on top of the container. The industry has a decade of literature on this ([Sultan, Ahmad, and Dimitriou, *Container Security: Issues, Challenges, and the Road Ahead*, IEEE Access 2019](https://ieeexplore.ieee.org/document/8693491)), and the standing recommendation has not changed: containers are strong process isolation, not strong trust isolation.
- **They do not guarantee reproducibility.** A Dockerfile whose `FROM` line reads `python:3.12-slim` builds against whichever image `latest` for that tag happens to point at *right now*. Tomorrow, `docker build` produces something different. Real reproducibility requires pinning by digest (`FROM python:3.12-slim@sha256:...`), pinning all system-package and language-package versions, and treating your base images as a supply-chain concern. Absent that discipline, "we containerized it" produces the same class of drift bug at a different layer.
- **They do not remove the need to think about state.** Containers are meant to be ephemeral. Databases, message queues, and persistent caches are not. Running stateful workloads inside containers is possible and increasingly common, but it does not remove the underlying data problems — backups, replication, upgrade paths — that made stateful systems hard before containers existed. You cannot cargo-cult stateless patterns onto stateful workloads.
- **They do not make Kubernetes free.** Kubernetes is genuinely complex, has genuine operational cost, and pays back that cost only at a specific scale of operation. A single service on a single VM does not need Kubernetes. Reaching for it because "everyone else does" is one of the more common ways teams introduce a permanent tax on themselves.
- **They do not replace observability.** Because a container is disposable, its filesystem is disposable — logs written to disk vanish when the container stops. You need a log aggregator (or at least `stdout` collection), metrics, and tracing *outside* the container. Otherwise you have made your services harder to inspect after the fact, not easier.

The reason to name these limits is that a team that has just spent months adopting containers is often tempted to treat containerization as though it has solved problems it has only *staged*. The container is the shipping box. The thing inside the box still has to be well-built, well-tested, and well-understood; the box does not do that work for you.

## The one thing to take away

If you take one idea from this post: **a container packages an application together with the exact runtime it needs into a single artifact that behaves identically wherever it runs — and the value of doing that is measured in the environment-drift bugs you no longer have to chase.**

You do not need Kubernetes to start. Most useful container adoption begins with one Dockerfile in one repository and a `docker run` command in a README, matures into a `docker-compose.yml` for local development, and only later reaches for an orchestrator when the number of coordinated services makes it obvious. The right time to start is *before* every environment-mismatch bug becomes so normalized that everyone has learned to say *"works on my machine"* with a straight face — because at that point, the fix looks like a huge migration and the manual setup is culturally load-bearing.

Find one service in your organization whose staging deploy breaks in a different way each release. Try packaging it into an image, running it locally from that image, and pushing the image to a registry. If the first end-to-end deploy from that image succeeds where the last three imperative deploys failed, you have already answered the question of whether the effort was worth it.

The container, it turns out, is where the cheapest deploy of your quarter gets spent.

## Where to read more

- **[The OCI Image Format specification](https://github.com/opencontainers/image-spec)** — the canonical description of what a container image actually is. Short, precise, worth an evening.
- **[Kubernetes concepts documentation](https://kubernetes.io/docs/concepts/)** — the free, official primer on the vocabulary and object model. Reading the first half gets you the working mental model most engineers need.
- **[Verma et al., *Large-scale cluster management at Google with Borg* (EuroSys 2015)](https://research.google/pubs/pub43438/)** — the paper that documents the internal system Kubernetes was designed to be an open-source echo of. Reads more like an ops retrospective than a research paper.
- **[Burns, Grant, Oppenheimer, Brewer, and Wilkes, *Borg, Omega, and Kubernetes* (ACM Queue 2016)](https://queue.acm.org/detail.cfm?id=2898444)** — a short essay by the Kubernetes founders on what they carried forward, what they left behind, and why.
- **[*Kubernetes: Up and Running* (Burns, Beda, Hightower, Villalba)](https://www.oreilly.com/library/view/kubernetes-up-and/9781098110192/)** — the practitioner reference most teams reach for. Good for the "I now need to actually operate this" step after the concepts primer.
- **[Docker's own *Getting Started* guide](https://docs.docker.com/get-started/)** — despite the vendor framing, still the shortest path from zero to running a container on your laptop.
