/**
 * ============================================================================
 * SUPABASE EDGE FUNCTION - SEND PHOTO AUDIT EMAIL
 * Version: R2.3.5 - Final Clean Version
 * ============================================================================
 * 
 * CHANGES FROM R2.3.4:
 * - ✅ Removed thumbnail images (only attachments now)
 * - ✅ Professional header styling
 * - ✅ Clean layout without broken image placeholders
 * 
 * Created: 2025-12-24
 * ============================================================================
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
}

interface EmailPhotoItem {
  fileName: string
  originalFileName?: string
  url?: string
  moldCode?: string
  moldName?: string
  dimensionL?: string | number
  dimensionW?: string | number
  dimensionD?: string | number
  setAsThumbnail?: boolean
}

interface EmailPayload {
  moldName: string
  moldCode: string
  moldId: number | string
  dimensionL?: string | number
  dimensionW?: string | number
  dimensionD?: string | number
  photoFileName?: string
  originalFileName?: string
  photos?: EmailPhotoItem[]
  employee: string
  employeeId?: string | number
  date: string
  notes?: string
  recipients: string[]
  ccRecipients?: string[]
  fromEmail?: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const payload: EmailPayload = await req.json()
    
    const isBatch = Array.isArray(payload.photos) && payload.photos.length > 0
    const hasSingle = !!payload.photoFileName
    
    if (!payload.moldCode || !payload.recipients?.length || (!isBatch && !hasSingle)) {
      throw new Error('Missing required fields')
    }

    console.log('📧 [send-photo-audit] Processing email:', {
      moldCode: payload.moldCode,
      isBatch,
      photoCount: isBatch ? payload.photos!.length : 1
    })

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    const downloadToBase64 = async (fileName: string) => {
      const { data: blob, error } = await supabase.storage
        .from('mold-photos')
        .download(fileName)
      
      if (error) throw new Error(`Failed to download photo: ${error.message}`)

      const arrayBuffer = await blob.arrayBuffer()
      const bytes = new Uint8Array(arrayBuffer)
      let binary = ''
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i])
      }
      const base64 = btoa(binary)
      const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/mold-photos/${encodeURIComponent(fileName)}`

      return { base64, publicUrl }
    }

    interface ProcessedPhoto {
      fileName: string
      originalFileName: string
      publicUrl: string
      base64: string
      moldCode: string
      moldName: string
      dimensionL: string
      dimensionW: string
      dimensionD: string
      setAsThumbnail: boolean
    }

    const processedPhotos: ProcessedPhoto[] = []

    if (isBatch) {
      for (const photo of payload.photos!) {
        const { base64, publicUrl } = await downloadToBase64(photo.fileName)
        processedPhotos.push({
          fileName: photo.fileName,
          originalFileName: photo.originalFileName || photo.fileName,
          publicUrl,
          base64,
          moldCode: photo.moldCode || payload.moldCode,
          moldName: photo.moldName || payload.moldName || payload.moldCode,
          dimensionL: photo.dimensionL?.toString() || payload.dimensionL?.toString() || '-',
          dimensionW: photo.dimensionW?.toString() || payload.dimensionW?.toString() || '-',
          dimensionD: photo.dimensionD?.toString() || payload.dimensionD?.toString() || '-',
          setAsThumbnail: photo.setAsThumbnail || false
        })
      }
    } else {
      const { base64, publicUrl } = await downloadToBase64(payload.photoFileName!)
      processedPhotos.push({
        fileName: payload.photoFileName!,
        originalFileName: payload.originalFileName || payload.photoFileName!,
        publicUrl,
        base64,
        moldCode: payload.moldCode,
        moldName: payload.moldName || payload.moldCode,
        dimensionL: payload.dimensionL?.toString() || '-',
        dimensionW: payload.dimensionW?.toString() || '-',
        dimensionD: payload.dimensionD?.toString() || '-',
        setAsThumbnail: false
      })
    }

    const photoCount = processedPhotos.length
    const subject = photoCount > 1
      ? `【写真監査】${payload.moldCode} | ${payload.employee} | ${payload.date} | ${photoCount}枚`
      : `【写真監査】${payload.moldCode} | ${payload.employee} | ${payload.date}`

    const escapeHtml = (str: string) => {
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
    }

    // CC Recipients (if any)
    let ccRecipientsHtml = ''
    if (payload.ccRecipients && payload.ccRecipients.length > 0) {
      const ccList = payload.ccRecipients
        .map(email => `<code style="background:#f0f0f0;padding:2px 6px;border-radius:3px;font-size:10pt;margin:0 3px;font-family:'Yu Gothic','游ゴシック',sans-serif">${escapeHtml(email)}</code>`)
        .join('')
      ccRecipientsHtml = `<div style="margin:8px 0;padding:8px;background:#f8f9fa;border-radius:4px;font-size:10pt;line-height:1.3;font-family:'Yu Gothic','游ゴシック',sans-serif"><strong>CC:</strong> ${ccList}</div>`
    }

    // Notes (if any)
    let notesHtml = ''
    if (payload.notes && payload.notes.trim()) {
      notesHtml = `<div style="margin:8px 0;padding:8px;background:#fff9e6;border-left:3px solid #ffc107;font-size:10pt;line-height:1.3;font-family:'Yu Gothic','游ゴシック',sans-serif"><strong>備考:</strong> ${escapeHtml(payload.notes)}</div>`
    }

    // Build table rows
    const tableRows = processedPhotos.map((photo, index) => {
      const dimensionStr = `${photo.dimensionL}×${photo.dimensionW}×${photo.dimensionD}`
      const thumbnailBadge = photo.setAsThumbnail ? '<span style="background:#ffc107;color:#000;padding:1px 6px;border-radius:3px;font-size:8pt;font-weight:700;margin-left:4px">★</span>' : ''
      
      return `
        <tr style="border-bottom:1px solid #e0e0e0">
          <td style="padding:5px 8px;font-size:11pt;text-align:center;font-family:'Yu Gothic','游ゴシック',sans-serif">${payload.moldId || '-'}</td>
          <td style="padding:5px 8px;font-size:11pt;font-weight:600;font-family:'Yu Gothic','游ゴシック',sans-serif">${escapeHtml(photo.moldCode)}${thumbnailBadge}</td>
          <td style="padding:5px 8px;font-size:10pt;font-family:'Yu Gothic','游ゴシック',sans-serif">${dimensionStr} mm</td>
          <td style="padding:5px 8px;font-size:10pt;font-family:'Yu Gothic','游ゴシック',sans-serif">${escapeHtml(payload.employee)}</td>
          <td style="padding:5px 8px;font-size:10pt;font-family:'Yu Gothic','游ゴシック',sans-serif">${escapeHtml(payload.date)}</td>
          <td style="padding:5px 8px;font-size:10pt;font-family:'Yu Gothic','游ゴシック',sans-serif">${escapeHtml(photo.originalFileName)}</td>
        </tr>
      `
    }).join('')

    // Mold Name header
    const uniqueMoldNames = [...new Set(processedPhotos.map(p => p.moldName))]
    const moldNameHeader = uniqueMoldNames.length === 1 
      ? `<div style="margin:0 0 8px 0;font-size:13pt;font-weight:600;color:#333;font-family:'Yu Gothic','游ゴシック',sans-serif;line-height:1.3">${escapeHtml(uniqueMoldNames[0])}</div>`
      : ''

    // Summary footer
    const ccListText = payload.ccRecipients && payload.ccRecipients.length > 0
      ? payload.ccRecipients.map(email => `<span style="background:#f0f0f0;padding:2px 6px;border-radius:3px;margin:0 3px;font-size:10pt">${escapeHtml(email)}</span>`).join('')
      : '<span style="color:#999">なし</span>'

    const summaryFooter = `
      <div style="margin:15px 0 0 0;padding:12px;background:#f8f9fa;border-radius:4px;font-size:10pt;line-height:1.5;font-family:'Yu Gothic','游ゴシック',sans-serif">
        <div style="margin-bottom:6px"><strong>📊 送信情報 / Summary:</strong></div>
        <div style="margin:3px 0"><strong>写真枚数:</strong> ${photoCount}枚</div>
        <div style="margin:3px 0"><strong>送信日時:</strong> ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
        <div style="margin:3px 0"><strong>撮影者:</strong> ${escapeHtml(payload.employee)}${payload.employeeId ? ` (ID: ${payload.employeeId})` : ''}</div>
        <div style="margin:3px 0"><strong>送信先:</strong> ${payload.recipients.map(e => `<span style="background:#e3f2fd;padding:2px 6px;border-radius:3px;margin:0 3px;font-size:10pt">${escapeHtml(e)}</span>`).join('')}</div>
        <div style="margin:3px 0"><strong>CC:</strong> ${ccListText}</div>
      </div>
    `

    // ✅ Outlook-optimized HTML - NO THUMBNAIL IMAGES
    const htmlContent = `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <style>
    body { margin:0; padding:0; font-family:'Yu Gothic','游ゴシック','Hiragino Sans',sans-serif; font-size:11pt; line-height:1.3; }
    table { border-collapse:collapse; mso-table-lspace:0pt; mso-table-rspace:0pt; }
    img { border:0; display:block; outline:none; text-decoration:none; }
    p, div { margin:0; padding:0; }
  </style>
</head>
<body style="background:#f5f5f5;margin:0;padding:0">
  <div style="max-width:800px;margin:0 auto;background:#fff;padding:16px">
    <div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#fff;padding:16px 20px;border-radius:6px;margin-bottom:12px;line-height:1.4">
      <h2 style="margin:0;font-size:16pt;font-weight:700;font-family:'Yu Gothic','游ゴシック',sans-serif;letter-spacing:0.5px">写真監査レポート</h2>
      <div style="font-size:11pt;opacity:0.95;margin-top:4px;font-family:'Yu Gothic','游ゴシック',sans-serif">Photo Audit Report</div>
    </div>
    ${ccRecipientsHtml}
    ${moldNameHeader}
    <table style="width:100%;border-collapse:collapse;margin:8px 0;border:1px solid #ddd;font-size:11pt">
      <thead>
        <tr style="background:#f0f0f0">
          <th style="padding:6px 8px;border-bottom:2px solid #ddd;font-size:10pt;font-weight:600;text-align:center;font-family:'Yu Gothic','游ゴシック',sans-serif">ID</th>
          <th style="padding:6px 8px;border-bottom:2px solid #ddd;font-size:10pt;font-weight:600;font-family:'Yu Gothic','游ゴシック',sans-serif">MoldCode</th>
          <th style="padding:6px 8px;border-bottom:2px solid #ddd;font-size:10pt;font-weight:600;font-family:'Yu Gothic','游ゴシック',sans-serif">寸法</th>
          <th style="padding:6px 8px;border-bottom:2px solid #ddd;font-size:10pt;font-weight:600;font-family:'Yu Gothic','游ゴシック',sans-serif">撮影者</th>
          <th style="padding:6px 8px;border-bottom:2px solid #ddd;font-size:10pt;font-weight:600;font-family:'Yu Gothic','游ゴシック',sans-serif">撮影日時</th>
          <th style="padding:6px 8px;border-bottom:2px solid #ddd;font-size:10pt;font-weight:600;font-family:'Yu Gothic','游ゴシック',sans-serif">元ファイル名</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows}
      </tbody>
    </table>
    ${notesHtml}
    ${summaryFooter}
    <div style="margin-top:15px;padding-top:10px;border-top:1px solid #e0e0e0;text-align:center;font-size:9pt;color:#999;line-height:1.4;font-family:'Yu Gothic','游ゴシック',sans-serif">
      <div>金型管理システム | YSD Pack Co., Ltd.</div>
    </div>
  </div>
</body>
</html>
    `.trim()

    const attachments = processedPhotos.map((photo, index) => ({
      filename: photo.originalFileName,
      content: photo.base64,
      contentid: `photo-${index}`
    }))

    const emailPayload = {
      from: '金型管理 <onboarding@resend.dev>',
      to: payload.recipients,
      subject: subject,
      html: htmlContent,
      attachments: attachments
    }

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(emailPayload)
    })

    if (!resendResponse.ok) {
      const errorData = await resendResponse.json()
      throw new Error(`Resend API error: ${JSON.stringify(errorData)}`)
    }

    const resendData = await resendResponse.json()

    // Log to database
    for (const photo of processedPhotos) {
      const audit = {
        moldid: payload.moldId ?? null,
        moldcode: photo.moldCode,
        moldname: photo.moldName,
        employeename: payload.employee,
        employeeid: payload.employeeId ?? null,
        photourl: photo.publicUrl,
        photofilename: photo.fileName,
        originalfilename: photo.originalFileName,
        dimensionslength: photo.dimensionL !== '-' ? photo.dimensionL : null,
        dimensionswidth: photo.dimensionW !== '-' ? photo.dimensionW : null,
        dimensionsdepth: photo.dimensionD !== '-' ? photo.dimensionD : null,
        notes: payload.notes ?? null,
        sentat: new Date().toISOString(),
        emailrecipients: payload.recipients.join(',')
      }

      const { error: insertError } = await supabase.from('photoaudits').insert(audit)
      if (insertError) {
        console.error('[PhotoAudit] Failed to log:', insertError.message)
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Email sent with ${photoCount} photo(s)`,
        emailId: resendData.id,
        photoCount: processedPhotos.length
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )

  } catch (error: any) {
    console.error('❌ [send-photo-audit] Error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Unknown error'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})
