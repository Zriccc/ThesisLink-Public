<?php
declare(strict_types=1);
namespace ThesisLink;

final class ApprovalPdf
{
    private const LETTER_WIDTH_MM=215.9;
    private const LETTER_HEIGHT_MM=279.4;

    /** Preserve the uploaded sheet itself, including its exact names and layout.
     * No OCR, invented signatories, or external rendering process is required. */
    public static function build(array $files, Storage $storage): string
    {
        if(array_sum(array_column($files,'byte_size'))>32*1024*1024)Http::fail(422,'Select fewer approval sheets: each PDF batch may contain at most 32 MB of source images.');
        $pdf=new \TCPDF('P','mm','LETTER',true,'UTF-8',false);$pdf->setPrintHeader(false);$pdf->setPrintFooter(false);
        $pdf->SetTitle('Approval Sheets');$pdf->SetMargins(10,10,10);$pdf->SetAutoPageBreak(false);
        $encodedTotal=0;
        foreach($files as $file){
            $bytes=(string)$storage->get($file)['Body'];$size=@getimagesizefromstring($bytes);
            if(!$size||$size[0]*$size[1]>12000000||strlen($bytes)>10485760)Http::fail(422,'Approval image is invalid or exceeds 12 megapixels. Upload a smaller full-page copy.');
            $image=@imagecreatefromstring($bytes);if(!$image)Http::fail(422,'Approval image could not be decoded.');
            $ratio=min(1,2200/max($size[0],$size[1]));$raster=imagecreatetruecolor(max(1,(int)round($size[0]*$ratio)),max(1,(int)round($size[1]*$ratio)));
            imagefill($raster,0,0,imagecolorallocate($raster,255,255,255));imagecopyresampled($raster,$image,0,0,0,0,imagesx($raster),imagesy($raster),$size[0],$size[1]);
            ob_start();imagejpeg($raster,null,90);$jpeg=ob_get_clean();imagedestroy($image);imagedestroy($raster);
            $encodedTotal+=strlen($jpeg);if($encodedTotal>24*1024*1024)Http::fail(422,'Select fewer approval sheets for this PDF batch.');
            $scale=min((self::LETTER_WIDTH_MM-20)/$size[0],(self::LETTER_HEIGHT_MM-20)/$size[1]);$width=$size[0]*$scale;$height=$size[1]*$scale;
            $pdf->AddPage();$pdf->Image('@'.$jpeg,(self::LETTER_WIDTH_MM-$width)/2,(self::LETTER_HEIGHT_MM-$height)/2,$width,$height,'JPEG');
        }
        return $pdf->Output('approval-sheets.pdf','S');
    }
}
