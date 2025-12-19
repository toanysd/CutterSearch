// Deno Deploy Edge Function
// File: supabase/functions/send-photo-audit/index.ts


import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'


const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!


const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}


interface EmailPayload {
  moldName: string
  moldCode: string
  moldId: number | string
  dimensions?: {
    length?: string | number
    width?: string | number
    depth?: string | number
  }
  photoFileName: string
  employee: string
  employeeId?: string | number
  date: string
  recipients: string[] // Multi recipients
  fromEmail?: string
}


serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }


  try {
    const payload: EmailPayload = await req.json()
   
    console.log('[PhotoAudit] Received payload:', {
      moldCode: payload.moldCode,
      photoFile: payload.photoFileName,
      recipients: payload.recipients
    })


    // Validate required fields
    if (!payload.moldCode || !payload.photoFileName || !payload.recipients?.length) {
      throw new Error('Missing required fields: moldCode, photoFileName, or recipients')
    }


    // Initialize Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)


    // 1. Download photo from storage
    const { data: photoBlob, error: downloadError } = await supabase.storage
      .from('mold-photos')
      .download(payload.photoFileName)


    if (downloadError) {
      throw new Error(`Failed to download photo: ${downloadError.message}`)
    }


    // 2. Convert to base64
    const arrayBuffer = await photoBlob.arrayBuffer()
    const bytes = new Uint8Array(arrayBuffer)
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    const base64Photo = btoa(binary)


    // 3. Format dimensions
    const dims = payload.dimensions || {}
    const length = dims.length || '-'
    const width = dims.width || '-'
    const depth = dims.depth || '-'
    const dimensionStr = `${length} × ${width} × ${depth}`


    // 4. Format email subject
    const subject = `【写真監査】${payload.moldCode} | ${payload.employee} | ${payload.date}`


    // 5. Build HTML email body
    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Hiragino Sans', sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      background: #f5f5f5;
    }
    .container {
      background: white;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 24px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 700;
    }
    .header p {
      margin: 8px 0 0 0;
      opacity: 0.9;
      font-size: 14px;
    }
    .content {
      padding: 32px 24px;
    }
    .info-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 24px;
    }
    .info-table tr {
      border-bottom: 1px solid #e5e7eb;
    }
    .info-table tr:last-child {
      border-bottom: none;
    }
    .info-table td {
      padding: 12px 8px;
    }
    .info-table td:first-child {
      font-weight: 600;
      color: #6b7280;
      width: 35%;
      font-size: 13px;
    }
    .info-table td:last-child {
      color: #111827;
      font-size: 15px;
      font-weight: 500;
    }
    .photo-section {
      margin-top: 32px;
    }
    .photo-section h2 {
      font-size: 16px;
      font-weight: 600;
      color: #374151;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .photo-section h2::before {
      content: "📷";
      font-size: 20px;
    }
    .photo-wrapper {
      border: 2px solid #e5e7eb;
      border-radius: 8px;
      overflow: hidden;
      background: #f9fafb;
    }
    .photo-wrapper img {
      width: 100%;
      height: auto;
      display: block;
    }
    .footer {
      background: #f9fafb;
      padding: 16px 24px;
      text-align: center;
      font-size: 12px;
      color: #6b7280;
      border-top: 1px solid #e5e7eb;
    }
    .badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
      background: #dbeafe;
      color: #1e40af;
    }
    @media (max-width: 600px) {
      body {
        padding: 8px;
      }
      .header, .content {
        padding: 16px;
      }
      .info-table td {
        padding: 8px 4px;
        font-size: 13px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>金型写真監査レポート</h1>
      <p>Mold Photo Audit Report</p>
    </div>
   
    <div class="content">
      <table class="info-table">
        <tr>
          <td>金型コード<br><small style="opacity:0.7">Mold Code</small></td>
          <td><strong>${payload.moldCode}</strong></td>
        </tr>
        <tr>
          <td>金型名<br><small style="opacity:0.7">Mold Name</small></td>
          <td>${payload.moldName || payload.moldCode}</td>
        </tr>
        <tr>
          <td>金型ID<br><small style="opacity:0.7">Mold ID</small></td>
          <td>${payload.moldId}</td>
        </tr>
        <tr>
          <td>寸法 (L×W×D)<br><small style="opacity:0.7">Dimensions</small></td>
          <td><span class="badge">${dimensionStr} mm</span></td>
        </tr>
        <tr>
          <td>撮影者<br><small style="opacity:0.7">Photographer</small></td>
          <td>${payload.employee}${payload.employeeId ? ` (ID: ${payload.employeeId})` : ''}</td>
        </tr>
        <tr>
          <td>撮影日<br><small style="opacity:0.7">Photo Date</small></td>
          <td>${payload.date}</td>
        </tr>
      </table>


      <div class="photo-section">
        <h2>撮影写真 / Photo</h2>
        <div class="photo-wrapper">
          <img src="cid:mold-photo" alt="${payload.moldCode} - Photo" />
        </div>
      </div>
    </div>


    <div class="footer">
      <p>
        このメールは自動送信されています。<br>
        <strong>金型管理システム</strong> | YSD Pack Co., Ltd.
      </p>
      <p style="margin-top: 8px; opacity: 0.7;">
        Sent: ${new Date().toISOString().replace('T', ' ').substring(0, 19)} UTC
      </p>
    </div>
  </div>
</body>
</html>
    `.trim()


    // 6. Send email via Resend
    const emailPayload = {
      from: payload.fromEmail || '金型管理 <onboarding@resend.dev>',
      to: payload.recipients,
      subject: subject,
      html: htmlBody,
      attachments: [
        {
          filename: `${payload.moldCode}_${payload.date.replace(/\//g, '-')}.jpg`,
          content: base64Photo,
          content_id: 'mold-photo'
        }
      ]
    }


    console.log('[PhotoAudit] Sending email to:', payload.recipients)


    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(emailPayload)
    })


    if (!emailResponse.ok) {
      const errorText = await emailResponse.text()
      throw new Error(`Resend API error: ${errorText}`)
    }


    const emailResult = await emailResponse.json()
    console.log('[PhotoAudit] Email sent successfully:', emailResult.id)


    // 7. Log to photo_audits table
    const photoUrl = `${SUPABASE_URL}/storage/v1/object/public/mold-photos/${payload.photoFileName}`
   
    const auditLogData = {
      mold_id: payload.moldId,
      mold_code: payload.moldCode,
      mold_name: payload.moldName || payload.moldCode,
      employee_name: payload.employee,
      employee_id: payload.employeeId || null,
      photo_url: photoUrl,
      dimensions_length: dims.length || null,
      dimensions_width: dims.width || null,
      dimensions_depth: dims.depth || null,
      sent_at: new Date().toISOString(),
      email_recipients: payload.recipients.join(', ')
    }


    const { error: insertError } = await supabase
      .from('photo_audits')
      .insert(auditLogData)


    if (insertError) {
      console.error('[PhotoAudit] Failed to log audit:', insertError.message)
      // Don't throw - email already sent successfully
    }


    // 8. Return success response
    return new Response(
      JSON.stringify({
        success: true,
        emailId: emailResult.id,
        photoUrl: photoUrl,
        recipients: payload.recipients
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )


  } catch (error: any) {
    console.error('[PhotoAudit] Error:', error)
   
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Unknown error occurred'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})