<?php

namespace Tests;

use App\Math;
use PHPUnit\Framework\TestCase;

final class MathTest extends TestCase
{
    public function testAddWorks(): void
    {
        $this->assertSame(5, (new Math())->add(2, 3));
    }
}
