/** SCF public hostnames contain the public AppID. Only that exact reviewed host
 * may contain it; SecretId, SecretKey and model keys never receive an exception. */
export function checkPublishCredentials(bytes, credentials, publicHost, path) {
  for (const {key, value} of credentials) {
    if (!bytes.includes(Buffer.from(value))) continue;
    if (key === 'TENCENT_APP_ID' && /^\d+-[a-z0-9]+\.ap-[a-z-]+\.tencentscf\.com$/.test(publicHost) && publicHost.startsWith(value + '-')) {
      if (!bytes.toString('utf8').split(publicHost).join('').includes(value)) continue;
    }
    throw new Error('Configured credential found (value withheld): ' + path);
  }
}
