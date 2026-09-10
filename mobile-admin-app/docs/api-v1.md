# Admin App API v1

Base path: `/api/v1/admin-app`

除登录、令牌刷新、密码恢复和版本清单外，所有接口必须使用：

```http
Authorization: Bearer <access_token>
Accept: application/json
```

令牌、密码、邮箱验证码和 Turnstile 响应不得写入访问日志或操作日志。

## 认证

### `POST /auth/login`

```json
{"username":"admin@example.com","password":"<password>"}
```

成功返回短期 access token 与可轮换 refresh token。服务端只保存两者的 SHA-256 摘要。

### `POST /auth/refresh`

```json
{"refresh_token":"<token>"}
```

成功后旧 refresh token 立即失效，并返回一组新令牌。

### `POST /auth/logout`

撤销当前 refresh 会话。修改管理员密码时撤销全部 App 与网页会话。

## Dashboard

### `GET /dashboard`

返回媒体、可见评论、待处理投稿、页面访问量、服务时间及数据库健康状态；不暴露主机密钥或进程环境。

## 内容和媒体

- `GET /media`
- `POST /media`
- `PATCH /media/{id}`
- `DELETE /media/{id}`
- `POST /uploads`：认证后的原始二进制流上传，使用 `Content-Type` 与 `X-File-Name`
- `DELETE /uploads/{name}`：只允许删除已归属内容且位于上传目录内的文件

## 评论与投稿

- `GET /comments?status=visible|hidden|all`
- `PATCH /comments/{id}`
- `DELETE /comments/{id}`
- `GET /submissions?status=pending|accepted|rejected|all`
- `PATCH /submissions/{id}`
- `DELETE /submissions/{id}`

## 网站设置

- `GET /settings`
- `PATCH /settings`

只接受服务端白名单中的设置键。第一版不允许 App 更改 API 地址、服务器路径、SMTP 或 Turnstile 密钥。

## 错误格式

```json
{
  "error": {
    "code": "validation_error",
    "message": "可直接展示给管理员的说明",
    "request_id": "随机请求标识"
  }
}
```

HTTP 状态语义：`400` 参数错误、`401` 未认证或令牌过期、`403` 拒绝操作、`404` 不存在、`409` 冲突、`413` 文件过大、`429` 频率过高、`500` 服务端错误。

## 更新清单

`version.json` 不需要管理员认证，包含：

```json
{
  "version_name": "1.0.0",
  "version_code": 1,
  "git_commit": "0000000000000000000000000000000000000000",
  "apk_url": "https://example.com/app/into-youth-admin-1.0.0.apk",
  "github_release_url": "https://github.com/example/repository/releases/tag/app-v1.0.0",
  "sha256": "64位小写十六进制",
  "mandatory": false,
  "notes": "更新说明"
}
```
