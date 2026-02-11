deployment = "prod"
manager    = "ci-tf"

ecs = {
  cluster_name = "production-services"
  cpu          = 512
  memory       = 1024
  envvars = {
    api_port            = "8080"
    fergus_api_base_url = "https://api.fergus.com"
    cognito_region      = "ap-southeast-2"
    cognito_domain      = "" # TODO: Set Cognito Domain (e.g., auth.fergus.com)
    oauth_redirect_uri  = "https://mcp.fergus.com/oauth/callback"
    session_storage     = "redis"
    redis_url_arn       = "TODO"
  }
}

health_check_path    = "/health"
desired_count        = 2
scaling_min_capacity = 2
scaling_max_capacity = 4
