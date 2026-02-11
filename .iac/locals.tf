locals {
  service_name = "mcp"

  meta_tags = {
    Deployment = var.deployment
    Manager    = var.manager
  }

  container_port = tonumber(var.ecs.envvars.api_port)
}
