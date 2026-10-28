// The CloudFormation templates for poapkings.com on S3 and CloudFront, written to infra/generated/ by
// `npm run infra:generate`. Three stacks, each deployed from the Mac as the cloud-engineer identity
// (`npm run infra -- <stack>`), never from CI:
//
//   certificate  poapkings.com and www.poapkings.com, validated by two CNAMEs at Namecheap
//   site         the bucket, the distribution, its function and redirect store, headers, access log,
//                5xx alarm
//   delivery     the role GitHub Actions assumes to publish a build (scripts/deploy-aws.mjs)
//
// The shape is escape.thingelstad.com's (2026-10-26). Stack tags (Application Elixir, Project poapkings)
// are in infra/deployment.json; the alarm goes to Drop's topic, which feeds projects-ops-alerts.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { viewerRequestCode } from './viewer-request.mjs';

export const DOMAIN = 'poapkings.com';
export const WWW = `www.${DOMAIN}`;
const ref = (name) => ({ Ref: name });
const sub = (value) => ({ 'Fn::Sub': value });
const get = (name, field) => ({ 'Fn::GetAtt': [name, field] });
const custom = (a, b) => ({ 'Fn::If': ['CustomDomain', a, b] });
// The clash-royale family's alarm topic (Drop's), subscribed to the shared projects-ops-alerts queue.
const alarmTopic = sub('arn:${AWS::Partition}:sns:us-east-1:${AWS::AccountId}:elixir-drop-alarms');
// AWS managed CachingOptimized: no cookies, headers or query strings in the key, so ?ref= variants share
// one cached copy; it honours the Cache-Control each object is uploaded with. The Host header is not in
// the key either, which is safe because the function answers every www. request before the cache.
const CACHING_OPTIMIZED = '658327ea-f89d-4fab-a63d-7e88639e58f6';
const LOG_NAME = 'poapkings-web-access';

const template = (Description, Resources, Outputs, extra = {}) => ({
  AWSTemplateFormatVersion: '2010-09-09',
  Description,
  ...extra,
  Resources,
  Outputs
});
const output = (Value) => ({ Value });

export const certificate = template(
  `${DOMAIN} and ${WWW} HTTPS certificate - external DNS validation`,
  {
    Certificate: {
      Type: 'AWS::CertificateManager::Certificate',
      Properties: { DomainName: DOMAIN, SubjectAlternativeNames: [WWW], ValidationMethod: 'DNS' }
    }
  },
  { CertificateArn: output(ref('Certificate')) }
);

export const site = template(
  `${DOMAIN} static site - the POAP KINGS clan website`,
  {
    // Versioned, so an object a deploy deletes or overwrites can be restored.
    SiteBucket: {
      Type: 'AWS::S3::Bucket',
      DeletionPolicy: 'Retain',
      UpdateReplacePolicy: 'Retain',
      Properties: {
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true
        },
        BucketEncryption: {
          ServerSideEncryptionConfiguration: [{ ServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } }]
        },
        OwnershipControls: { Rules: [{ ObjectOwnership: 'BucketOwnerEnforced' }] },
        VersioningConfiguration: { Status: 'Enabled' },
        LifecycleConfiguration: {
          Rules: [{ Id: 'old-versions', Status: 'Enabled', NoncurrentVersionExpiration: { NoncurrentDays: 90 } }]
        }
      }
    },
    SitePolicy: {
      Type: 'AWS::S3::BucketPolicy',
      Properties: {
        Bucket: ref('SiteBucket'),
        PolicyDocument: {
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: { Service: 'cloudfront.amazonaws.com' },
              Action: 's3:GetObject',
              Resource: sub('${SiteBucket.Arn}/*'),
              Condition: {
                StringEquals: {
                  'AWS:SourceArn': sub('arn:${AWS::Partition}:cloudfront::${AWS::AccountId}:distribution/${Distribution}')
                }
              }
            }
          ]
        }
      }
    },
    OriginAccess: {
      Type: 'AWS::CloudFront::OriginAccessControl',
      Properties: {
        OriginAccessControlConfig: {
          Name: sub('${AWS::StackName}-s3'),
          OriginAccessControlOriginType: 's3',
          SigningBehavior: 'always',
          SigningProtocol: 'sigv4'
        }
      }
    },
    // Filled by each deploy from the build's _redirects.json; see viewer-request.mjs.
    Redirects: {
      Type: 'AWS::CloudFront::KeyValueStore',
      Properties: {
        Name: sub('${AWS::StackName}-redirects'),
        Comment: 'Redirect paths to their targets, written by each deploy from the build'
      }
    },
    ViewerRequest: {
      Type: 'AWS::CloudFront::Function',
      Properties: {
        Name: sub('${AWS::StackName}-viewer-request'),
        AutoPublish: true,
        FunctionConfig: {
          Comment: 'www to the apex, redirects as 301s, the slash form, and index.html for directory URLs',
          Runtime: 'cloudfront-js-2.0',
          KeyValueStoreAssociations: [{ KeyValueStoreARN: get('Redirects', 'Arn') }]
        },
        FunctionCode: viewerRequestCode
      }
    },
    // GitHub Pages answered every file with Access-Control-Allow-Origin: *, so this keeps that for the
    // /data/*.json and llms files other sites and tools fetch, and adds the security headers.
    Headers: {
      Type: 'AWS::CloudFront::ResponseHeadersPolicy',
      Properties: {
        ResponseHeadersPolicyConfig: {
          Name: sub('${AWS::StackName}-headers'),
          CorsConfig: {
            AccessControlAllowCredentials: false,
            AccessControlAllowHeaders: { Items: ['*'] },
            AccessControlAllowMethods: { Items: ['GET', 'HEAD'] },
            AccessControlAllowOrigins: { Items: ['*'] },
            OriginOverride: true
          },
          SecurityHeadersConfig: {
            ContentTypeOptions: { Override: true },
            FrameOptions: { FrameOption: 'SAMEORIGIN', Override: true },
            ReferrerPolicy: { ReferrerPolicy: 'strict-origin-when-cross-origin', Override: true },
            StrictTransportSecurity: { AccessControlMaxAgeSec: 31536000, Override: true }
          }
        }
      }
    },
    Distribution: {
      Type: 'AWS::CloudFront::Distribution',
      Properties: {
        DistributionConfig: {
          Enabled: true,
          Comment: `${DOMAIN} - POAP KINGS`,
          PriceClass: 'PriceClass_100',
          IPV6Enabled: true,
          HttpVersion: 'http2and3',
          DefaultRootObject: 'index.html',
          Aliases: custom([DOMAIN, WWW], ref('AWS::NoValue')),
          ViewerCertificate: custom(
            { AcmCertificateArn: ref('CertificateArn'), SslSupportMethod: 'sni-only', MinimumProtocolVersion: 'TLSv1.2_2021' },
            { CloudFrontDefaultCertificate: true }
          ),
          Origins: [
            {
              Id: 'site',
              DomainName: get('SiteBucket', 'RegionalDomainName'),
              OriginAccessControlId: ref('OriginAccess'),
              S3OriginConfig: { OriginAccessIdentity: '' }
            }
          ],
          DefaultCacheBehavior: {
            TargetOriginId: 'site',
            ViewerProtocolPolicy: 'redirect-to-https',
            AllowedMethods: ['GET', 'HEAD', 'OPTIONS'],
            CachedMethods: ['GET', 'HEAD'],
            Compress: true,
            CachePolicyId: CACHING_OPTIMIZED,
            ResponseHeadersPolicyId: ref('Headers'),
            FunctionAssociations: [{ EventType: 'viewer-request', FunctionARN: get('ViewerRequest', 'FunctionARN') }]
          },
          // A missing object is a 403 from S3 behind OAC (no ListBucket). Both become the site's 404 page.
          CustomErrorResponses: [
            { ErrorCode: 403, ResponseCode: 404, ResponsePagePath: '/404.html', ErrorCachingMinTTL: 60 },
            { ErrorCode: 404, ResponseCode: 404, ResponsePagePath: '/404.html', ErrorCachingMinTTL: 60 }
          ]
        }
      }
    },
    DistributionErrorAlarm: {
      Type: 'AWS::CloudWatch::Alarm',
      Properties: {
        AlarmName: sub('${AWS::StackName}-distribution-5xx'),
        AlarmDescription: `CloudFront returned more than 5% 5xx responses for ${DOMAIN} in two of three five-minute windows.`,
        Namespace: 'AWS/CloudFront',
        MetricName: '5xxErrorRate',
        Dimensions: [
          { Name: 'DistributionId', Value: ref('Distribution') },
          { Name: 'Region', Value: 'Global' }
        ],
        Statistic: 'Average',
        Period: 300,
        EvaluationPeriods: 3,
        DatapointsToAlarm: 2,
        Threshold: 5,
        ComparisonOperator: 'GreaterThanThreshold',
        TreatMissingData: 'notBreaching',
        AlarmActions: [alarmTopic]
      }
    },
    // Access logs, the same shape as the other sites' (/escape/web-access, /thingelstad-xyz/web-access):
    // CloudFront's standard logging into CloudWatch Logs, kept 24 months (731 days), with no client IP and no query
    // string. No path on this site carries a token, so the path stays.
    AccessLogGroup: {
      Type: 'AWS::Logs::LogGroup',
      Properties: { LogGroupName: '/poapkings/web-access', RetentionInDays: 731 }
    },
    AccessLogSource: {
      Type: 'AWS::Logs::DeliverySource',
      Properties: {
        Name: LOG_NAME,
        LogType: 'ACCESS_LOGS',
        ResourceArn: sub('arn:${AWS::Partition}:cloudfront::${AWS::AccountId}:distribution/${Distribution}')
      }
    },
    AccessLogDestination: {
      Type: 'AWS::Logs::DeliveryDestination',
      Properties: {
        Name: LOG_NAME,
        DestinationResourceArn: get('AccessLogGroup', 'Arn'),
        OutputFormat: 'json'
      }
    },
    AccessLogDelivery: {
      Type: 'AWS::Logs::Delivery',
      DependsOn: 'AccessLogSource',
      Properties: {
        DeliverySourceName: LOG_NAME,
        DeliveryDestinationArn: get('AccessLogDestination', 'Arn'),
        RecordFields: [
          'timestamp(ms)',
          'cs-method',
          'cs(Host)',
          'cs-uri-stem',
          'sc-status',
          'sc-bytes',
          'sc-range-start',
          'sc-range-end',
          'time-taken',
          'time-to-first-byte',
          'x-edge-result-type',
          'x-edge-detailed-result-type',
          'x-edge-location',
          'cs-protocol',
          'cs(User-Agent)'
        ]
      }
    }
  },
  {
    SiteBucket: output(ref('SiteBucket')),
    DistributionId: output(ref('Distribution')),
    CloudFrontDomain: output(get('Distribution', 'DomainName')),
    RedirectStoreArn: output(get('Redirects', 'Arn'))
  },
  {
    Parameters: { CertificateArn: { Type: 'String', Default: '' } },
    Conditions: { CustomDomain: { 'Fn::Not': [{ 'Fn::Equals': [ref('CertificateArn'), ''] }] } }
  }
);

// Application delivery only: publish a build into the bucket, refresh the redirect store, clear the
// cache. Infrastructure changes stay a separate, local deployment. Trusted, as Drop's is, only for the
// repository's production environment, which only main can deploy to.
export const delivery = template(
  `${DOMAIN} GitHub application delivery - the POAP KINGS clan website`,
  {
    DeploymentRole: {
      Type: 'AWS::IAM::Role',
      Properties: {
        AssumeRolePolicyDocument: {
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: {
                Federated: sub('arn:${AWS::Partition}:iam::${AWS::AccountId}:oidc-provider/token.actions.githubusercontent.com')
              },
              Action: 'sts:AssumeRoleWithWebIdentity',
              Condition: {
                StringEquals: {
                  'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
                  // GitHub's immutable subject (owner and repository ids) and the named form.
                  'token.actions.githubusercontent.com:sub': [
                    'repo:jthingelstad@5351/poapkings.com@1150258107:environment:production',
                    'repo:jthingelstad/poapkings.com:environment:production'
                  ]
                }
              }
            }
          ]
        },
        Policies: [
          {
            PolicyName: 'ApplicationDelivery',
            PolicyDocument: {
              Version: '2012-10-17',
              Statement: [
                {
                  Effect: 'Allow',
                  Action: ['s3:ListBucket', 's3:GetBucketLocation'],
                  Resource: sub('arn:${AWS::Partition}:s3:::${SiteBucket}')
                },
                {
                  // Delete removes pages the build no longer writes; the bucket keeps 90 days of versions.
                  Effect: 'Allow',
                  Action: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'],
                  Resource: sub('arn:${AWS::Partition}:s3:::${SiteBucket}/*')
                },
                {
                  Effect: 'Allow',
                  Action: ['cloudfront:CreateInvalidation', 'cloudfront:GetInvalidation', 'cloudfront:GetDistribution'],
                  Resource: sub('arn:${AWS::Partition}:cloudfront::${AWS::AccountId}:distribution/${DistributionId}')
                },
                {
                  Effect: 'Allow',
                  Action: [
                    'cloudfront-keyvaluestore:DescribeKeyValueStore',
                    'cloudfront-keyvaluestore:ListKeys',
                    'cloudfront-keyvaluestore:UpdateKeys'
                  ],
                  Resource: ref('RedirectStoreArn')
                },
                {
                  // Read-only: the deploy refuses to publish unless the live template matches the generated one.
                  Effect: 'Allow',
                  Action: ['cloudformation:DescribeStacks', 'cloudformation:GetTemplate'],
                  Resource: sub('arn:${AWS::Partition}:cloudformation:${AWS::Region}:${AWS::AccountId}:stack/${SiteStack}/*')
                }
              ]
            }
          }
        ]
      }
    }
  },
  { DeploymentRoleArn: output(get('DeploymentRole', 'Arn')) },
  {
    Parameters: {
      SiteStack: { Type: 'String' },
      SiteBucket: { Type: 'String' },
      DistributionId: { Type: 'String' },
      RedirectStoreArn: { Type: 'String' }
    }
  }
);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = join(dirname(fileURLToPath(import.meta.url)), 'generated');
  mkdirSync(out, { recursive: true });
  for (const [name, body] of Object.entries({ certificate, site, delivery }))
    writeFileSync(join(out, `${name}.json`), JSON.stringify(body, null, 2) + '\n');
}
