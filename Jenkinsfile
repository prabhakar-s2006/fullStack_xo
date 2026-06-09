pipeline {
    agent any
    environment {
        DOCKER_IMAGE = "prabhakar2706/fullstack-xo-jenkins:latest"
    }
    stages {
        stage('git checkout') {
            steps {
                git branch: 'main', url: 'https://github.com/prabhakar-s2006/Devops_pipeline.git'
            }
        }
        stage('docker build ') {
            steps {
                sh 'docker build -t $DOCKER_IMAGE .'
            }
        }
        stage('docker login') {
            steps {
                withCredentials([usernamePassword(credentialsId: 'dockerhub-credentials', passwordVariable: 'DOCKER_PASSWORD', usernameVariable: 'DOCKER_USERNAME')]) {
                    sh 'echo "$DOCKER_PASSWORD" | docker login -u "$DOCKER_USERNAME" --password-stdin'

                }
            }
        }
        stage('docker push') {
            steps {
                sh 'docker push $DOCKER_IMAGE '
            }
        }
        stage('kubernetes deployment') {
            steps {
                sh '''kubectl delete pod xo-game-pod --ignore-not-found=true
kubectl apply -f Pod.yaml
kubectl apply -f services.yaml'''
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

