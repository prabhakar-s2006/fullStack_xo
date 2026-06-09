# FullStack XO - CI/CD Deployment using Jenkins, Docker, and Kubernetes

This project demonstrates how to containerize a frontend XO game application using Docker and automate the complete deployment process using Jenkins CI/CD pipeline. The application is deployed on a Kubernetes cluster running on an AWS EC2 instance using Minikube.

## Project Overview

The main goal of this project is to automate the process of building, pushing, and deploying a Dockerized application using Jenkins.

Whenever code changes are pushed to the GitHub repository, Jenkins automatically triggers the pipeline using a GitHub webhook. The pipeline builds the Docker image, pushes it to Docker Hub, and deploys the application to Kubernetes.

## Technologies Used

* GitHub
* Jenkins
* Docker
* Docker Hub
* Kubernetes
* Minikube
* AWS EC2
* Ubuntu
* GitHub Webhook

## Project Architecture

```text
Developer pushes code to GitHub
        |
        v
GitHub Webhook triggers Jenkins
        |
        v
Jenkins Pipeline starts
        |
        v
Docker image is built
        |
        v
Docker image is pushed to Docker Hub
        |
        v
Kubernetes Pod and Service are deployed
        |
        v
Application is accessed through EC2 public IP and port-forwarding
```

## Repository Structure

```text
fullStack_xo/
│
├── Dockerfile
├── Jenkinsfile
├── Pod.yaml
├── services.yaml
├── package.json
├── index.js
├── public/
└── README.md
```

## Docker Image

The Docker image is built and pushed to Docker Hub using Jenkins.

Docker image used in this project:

```text
prabhakar2706/fullstack-xo-jenkins:latest
```

## Kubernetes Files

### Pod.yaml

This file creates a Kubernetes Pod for running the application container.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: xo-game-pod
  labels:
    app: xo-pods
    tier: frontend
spec:
  containers:
    - name: xo-container
      image: prabhakar2706/fullstack-xo-jenkins:latest
      ports:
        - containerPort: 3000
```

### services.yaml

This file creates a NodePort service to expose the application.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: xo-game-service
spec:
  type: NodePort
  selector:
    app: xo-pods
  ports:
    - port: 3000
      targetPort: 3000
      nodePort: 30080
```

## Jenkins Pipeline

The Jenkins pipeline performs the following stages:

1. Checkout code from GitHub
2. Build Docker image
3. Login to Docker Hub
4. Push Docker image to Docker Hub
5. Deploy application to Kubernetes
6. Expose application using port-forwarding

```groovy
pipeline {
    agent any

    environment {
        DOCKER_IMAGE = "prabhakar2706/fullstack-xo-jenkins:latest"
    }

    stages {
        stage('git checkout') {
            steps {
                git branch: 'main', url: 'https://github.com/prabhakar-s2006/fullStack_xo.git'
            }
        }

        stage('docker build') {
            steps {
                sh 'docker build -t $DOCKER_IMAGE .'
            }
        }

        stage('docker login') {
            steps {
                withCredentials([usernamePassword(
                    credentialsId: 'dockerhub-credentials',
                    passwordVariable: 'DOCKER_PASSWORD',
                    usernameVariable: 'DOCKER_USERNAME'
                )]) {
                    sh 'echo "$DOCKER_PASSWORD" | docker login -u "$DOCKER_USERNAME" --password-stdin'
                }
            }
        }

        stage('docker push') {
            steps {
                sh 'docker push $DOCKER_IMAGE'
            }
        }

        stage('kubernetes deployment') {
            steps {
                sh '''
                kubectl delete pod xo-game-pod --ignore-not-found=true
                kubectl apply -f Pod.yaml
                kubectl apply -f services.yaml
                '''
            }
        }

        stage('expose app') {
            steps {
                sh '''
                kubectl wait --for=condition=Ready pod/xo-game-pod --timeout=120s

                pkill -f "kubectl port-forward.*xo-game-service" || true

                JENKINS_NODE_COOKIE=dontKillMe nohup kubectl port-forward --address 0.0.0.0 svc/xo-game-service 30080:3000 > /tmp/port-forward.log 2>&1 &

                sleep 5

                cat /tmp/port-forward.log || true
                '''
            }
        }
    }
}
```

## Jenkins Setup

The following Jenkins plugins are required:

* Pipeline
* Git
* Credentials
* Credentials Binding

Docker Hub credentials are stored in Jenkins using:

```text
Manage Jenkins → Credentials → Global Credentials → Add Credentials
```

Credential details:

```text
Kind: Username with password
ID: dockerhub-credentials
Username: Docker Hub username
Password: Docker Hub access token
```

## GitHub Webhook Setup

A GitHub webhook is configured to automatically trigger Jenkins whenever code is pushed to the repository.

Webhook URL:

```text
http://<jenkins-public-ip>:8080/github-webhook/
```

Content type:

```text
application/json
```

Event selected:

```text
Just the push event
```

## Deployment Steps

### 1. Clone the repository

```bash
git clone https://github.com/prabhakar-s2006/fullStack_xo.git
cd fullStack_xo
```

### 2. Make changes and push

```bash
git add .
git commit -m "updated application"
git push origin main
```

### 3. Jenkins pipeline starts automatically

After the push, GitHub webhook triggers the Jenkins pipeline.

### 4. Check Kubernetes resources

```bash
kubectl get pods
kubectl get svc
```

Expected output:

```text
xo-game-pod       1/1 Running
xo-game-service   NodePort   3000:30080/TCP
```

### 5. Access the application

The application can be accessed using:

```text
http://<ec2-public-ip>:30080
```

Example:

```text
http://13.126.162.119:30080
```

## Important Notes

Since Minikube is running inside an EC2 instance, the NodePort service may not be directly accessible through the EC2 public IP. To expose the application externally, port-forwarding is used:

```bash
kubectl port-forward --address 0.0.0.0 svc/xo-game-service 30080:3000
```

To run it in the background:

```bash
nohup kubectl port-forward --address 0.0.0.0 svc/xo-game-service 30080:3000 > /tmp/port-forward.log 2>&1 &
```

## Useful Commands

Check running pods:

```bash
kubectl get pods
```

Check services:

```bash
kubectl get svc
```

Check pod logs:

```bash
kubectl logs xo-game-pod
```

Delete pod:

```bash
kubectl delete pod xo-game-pod
```

Delete service:

```bash
kubectl delete svc xo-game-service
```

Check port-forward process:

```bash
ps aux | grep port-forward
```

Stop port-forward:

```bash
pkill -f "kubectl port-forward.*xo-game-service"
```

Check Docker images:

```bash
docker images
```

Check running Docker containers:

```bash
docker ps
```

## Final Output

After successful deployment, the application runs inside a Kubernetes pod and is accessible through the EC2 public IP using port `30080`.

## Conclusion

This project shows a complete CI/CD workflow using Jenkins, Docker, Docker Hub, Kubernetes, and AWS EC2. It automates the deployment process from code commit to application deployment, making the software delivery process faster and more reliable.
