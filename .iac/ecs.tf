module "mcp-service" {
  source  = "app.terraform.io/Fergus/ecs/fergus//modules/api"
  version = "1.12.1"

  deployment      = var.deployment
  service_name    = local.service_name
  service_version = var.gitref
  image           = var.image
  subdomain       = var.deployment == "prod" ? "mcp" : "mcp.staging"
  github_actions_repo_ref = "repo:Jayco-Design/fergus-mcp:ref:refs/heads/main"


  cpu              = var.ecs.cpu
  memory           = var.ecs.memory
  cpu_architecture = "ARM64"

  container_port = local.container_port

  desired_count        = var.desired_count
  scaling_min_capacity = var.scaling_min_capacity
  scaling_max_capacity = var.scaling_max_capacity

  network_type             = "gated"
  use_load_balancer        = true
  load_balancer_type       = "application"
  alb_deregistration_delay = 30

  container_health_check = {
    enabled        = true
    command_script = "wget -qOS- http://0.0.0.0:%d%s"
    interval       = 30
    retries        = 3
    start_period   = 30
    timeout        = 20
  }

  health_check_path = var.health_check_path

  env = {
    PORT              = var.ecs.envvars.api_port
    HTTP_HOST         = "0.0.0.0"
    HTTP_PORT         = var.ecs.envvars.api_port
    FERGUS_BASE_URL   = var.ecs.envvars.fergus_api_base_url
    COGNITO_REGION    = var.ecs.envvars.cognito_region
    COGNITO_DOMAIN    = var.ecs.envvars.cognito_domain
    OAUTH_REDIRECT_URI = var.ecs.envvars.oauth_redirect_uri
    SESSION_STORAGE   = var.ecs.envvars.session_storage
    REDIS_URL         = var.ecs.envvars.redis_url_arn
    NODE_ENV          = "production"
  }

  secret_key_names = ["COGNITO_USER_POOL_ID", "COGNITO_CLIENT_ID", "COGNITO_CLIENT_SECRET"] 

  include_datadog_sidecar = false

  create_subdomain = true
  create_log_group = true

  tags = merge(local.meta_tags, {
    Service = local.service_name
  })
}
