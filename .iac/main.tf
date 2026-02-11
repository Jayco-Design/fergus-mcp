terraform {

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">=5.83.0"
    }
  }

  cloud {
    hostname     = "app.terraform.io"
    organization = "fergus"

    workspaces {
      tags = ["fergus-mcp"]
    }
  }
}

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

provider "aws" {
  region = "ap-southeast-2"
}
